/**
 * 后台任务服务 — 任务台账 + 原子领取 + 租约（多实例安全）
 *
 * 状态机：
 *   script   : pending → running → completed / failed / cancelled / interrupted
 *   schedule : waiting → running（持有租约）→ waiting（下一次）/ completed / cancelled
 *   paused 可来自 waiting / pending；cancel 可来自任意非终态。
 *
 * 多实例安全靠两件事：
 *   1. 领取是单条原子 UPDATE（CTE + FOR UPDATE SKIP LOCKED），同一任务只会被一个实例拿到；
 *   2. 执行期间持有租约（lease_owner + lease_expires_at），超时后其他实例可接管，
 *      租约过期即视为原实例已崩溃（对应 pi 的 writer lease / crash 恢复语义）。
 *
 * 所有读写都必须带 tenantId + userId（后台任务的归属人）；租户/用户只从任务行取，
 * 绝不从调度参数或 payload 取。
 */
import type { Database } from '@ventostack/database';
import type {
  BackgroundSchedule,
  BackgroundScheduleKind,
} from '../agent-engine/background-task-schedule';
import {
  BackgroundScheduleError,
  computeNextRun,
  validateSchedule,
} from '../agent-engine/background-task-schedule';

export type BackgroundTaskKind = 'script' | 'schedule';
export type BackgroundTaskStatus =
  | 'pending'
  | 'waiting'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';
export type BackgroundRunStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled'
  | 'interrupted';
export type BackgroundRunTrigger = 'start' | 'schedule' | 'completion' | 'manual' | 'condition';

export interface BackgroundTaskScope {
  tenantId: string;
  userId: string;
}

export interface BackgroundTask {
  id: string;
  tenantId: string;
  userId: string;
  agentId: string;
  sessionId: string;
  title: string;
  kind: BackgroundTaskKind;
  status: BackgroundTaskStatus;
  command: string | null;
  conditionCommand: string | null;
  prompt: string | null;
  schedule: BackgroundSchedule | null;
  resumeOnFinish: boolean;
  notifyOnFinish: boolean;
  maxRuns: number;
  runCount: number;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastRunId: string | null;
  lastError: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  instanceId: string | null;
  sandboxId: string | null;
  execPid: string | null;
  execLogPath: string | null;
  execExitPath: string | null;
  /** 脚本最大运行时长（秒）；null = 不限制（历史数据） */
  maxRuntimeSeconds: number | null;
  /** 脚本执行截止时间：到点由 runner 终止并标记失败 */
  deadlineAt: string | null;
  /** 定时任务有效期：到期自动结束 */
  expiresAt: string | null;
  /** 连续失败次数（达到阈值自动暂停） */
  consecutiveFailures: number;
  createdAt: string;
  updatedAt: string;
}

export interface BackgroundTaskRun {
  id: string;
  taskId: string;
  tenantId: string;
  userId: string;
  sessionId: string;
  trigger: BackgroundRunTrigger;
  status: BackgroundRunStatus;
  scheduledAt: string | null;
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  output: string | null;
  error: string | null;
  finalContent: string | null;
}

export interface CreateBackgroundTaskParams {
  scope: BackgroundTaskScope;
  agentId: string;
  sessionId: string;
  title: string;
  kind: BackgroundTaskKind;
  command?: string;
  conditionCommand?: string;
  prompt?: string;
  schedule?: BackgroundSchedule;
  resumeOnFinish?: boolean;
  notifyOnFinish?: boolean;
  maxRuns?: number;
  /** 脚本任务最大运行时长（秒），默认 6 小时，范围 [60, 7 天] */
  maxRuntimeSeconds?: number;
  /** 定时任务有效期（小时），默认 7 天，范围 [1, 720] */
  expiresInHours?: number;
}

export interface ListBackgroundTasksParams {
  sessionId?: string;
  agentId?: string;
  status?: BackgroundTaskStatus;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface ScriptHandle {
  instanceId: string;
  sandboxId: string;
  pid: string;
  logPath: string;
  exitPath: string;
}

export interface LeaseOptions {
  owner: string;
  /** 租约时长（毫秒），默认 2 分钟；长 run 必须周期续约 */
  ttlMs?: number;
}

const DEFAULT_LEASE_TTL_MS = 120_000;
/** 脚本任务默认最大运行时长：6 小时（下载/构建类任务足够，避免卡死任务永久占用） */
export const DEFAULT_SCRIPT_MAX_RUNTIME_SECONDS = 6 * 60 * 60;
const MIN_MAX_RUNTIME_SECONDS = 60;
const MAX_MAX_RUNTIME_SECONDS = 7 * 24 * 60 * 60;
/** 定时任务默认有效期：7 天（到期自动结束，避免遗忘的任务无限消耗 token） */
export const DEFAULT_SCHEDULE_LIFETIME_HOURS = 7 * 24;
const MIN_LIFETIME_HOURS = 1;
const MAX_LIFETIME_HOURS = 24 * 30;
const MAX_RUN_OUTPUT_CHARS = 8_000;
const MAX_FINAL_CONTENT_CHARS = 8_000;

function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  return text.length > 0 ? text : null;
}

function num(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function truncate(value: string | undefined, max: number): string | null {
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max)}...[截断]` : value;
}

/** DB 行 → 任务实体（同时兼容 Date 与字符串时间戳） */
export function mapBackgroundTask(row: Record<string, unknown>): BackgroundTask {
  const scheduleKind = row.schedule_kind as BackgroundScheduleKind | null;
  const scheduleExpr = row.schedule_expr as string | null;
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    userId: String(row.user_id),
    agentId: String(row.agent_id),
    sessionId: String(row.session_id),
    title: String(row.title),
    kind: row.kind as BackgroundTaskKind,
    status: row.status as BackgroundTaskStatus,
    command: (row.command as string | null) ?? null,
    conditionCommand: (row.condition_command as string | null) ?? null,
    prompt: (row.prompt as string | null) ?? null,
    schedule: scheduleKind && scheduleExpr ? { kind: scheduleKind, expr: scheduleExpr } : null,
    resumeOnFinish: row.resume_on_finish !== false,
    notifyOnFinish: row.notify_on_finish !== false,
    maxRuns: num(row.max_runs) || 1,
    runCount: num(row.run_count),
    nextRunAt: iso(row.next_run_at),
    lastRunAt: iso(row.last_run_at),
    lastRunId: (row.last_run_id as string | null) ?? null,
    lastError: (row.last_error as string | null) ?? null,
    leaseOwner: (row.lease_owner as string | null) ?? null,
    leaseExpiresAt: iso(row.lease_expires_at),
    instanceId: (row.instance_id as string | null) ?? null,
    sandboxId: (row.sandbox_id as string | null) ?? null,
    execPid: (row.exec_pid as string | null) ?? null,
    execLogPath: (row.exec_log_path as string | null) ?? null,
    execExitPath: (row.exec_exit_path as string | null) ?? null,
    maxRuntimeSeconds:
      row.max_runtime_seconds === null || row.max_runtime_seconds === undefined
        ? null
        : num(row.max_runtime_seconds),
    deadlineAt: iso(row.deadline_at),
    expiresAt: iso(row.expires_at),
    consecutiveFailures: num(row.consecutive_failures),
    createdAt: iso(row.created_at) ?? new Date().toISOString(),
    updatedAt: iso(row.updated_at) ?? new Date().toISOString(),
  };
}

export function mapBackgroundTaskRun(row: Record<string, unknown>): BackgroundTaskRun {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    tenantId: String(row.tenant_id),
    userId: String(row.user_id),
    sessionId: String(row.session_id),
    trigger: row.trigger as BackgroundRunTrigger,
    status: row.status as BackgroundRunStatus,
    scheduledAt: iso(row.scheduled_at),
    startedAt: iso(row.started_at) ?? new Date().toISOString(),
    finishedAt: iso(row.finished_at),
    exitCode: row.exit_code === null || row.exit_code === undefined ? null : Number(row.exit_code),
    output: (row.output as string | null) ?? null,
    error: (row.error as string | null) ?? null,
    finalContent: (row.final_content as string | null) ?? null,
  };
}

export interface BackgroundTaskServiceDeps {
  db: Database;
}

export function createBackgroundTaskService(deps: BackgroundTaskServiceDeps) {
  const { db } = deps;

  async function create(params: CreateBackgroundTaskParams): Promise<BackgroundTask> {
    const { scope } = params;
    const kind = params.kind;
    if (kind === 'script' && !params.command?.trim()) {
      throw new BackgroundScheduleError('脚本任务必须提供 command');
    }
    if (kind === 'schedule') {
      if (!params.prompt?.trim()) throw new BackgroundScheduleError('定时任务必须提供 prompt');
      if (!params.schedule) throw new BackgroundScheduleError('定时任务必须提供 schedule');
      validateSchedule(params.schedule);
    }
    const nextRunAt =
      kind === 'script'
        ? null
        : (computeNextRun(params.schedule!, new Date())?.toISOString() ?? null);
    const status: BackgroundTaskStatus = kind === 'script' ? 'pending' : 'waiting';
    const id = crypto.randomUUID();
    const program = params.conditionCommand?.trim() || null;
    // 兜底边界必须在服务端裁剪：模型/前端传什么都夹到安全范围，不允许「无上限」
    const maxRuntimeSeconds =
      kind === 'script'
        ? Math.min(
            Math.max(
              params.maxRuntimeSeconds ?? DEFAULT_SCRIPT_MAX_RUNTIME_SECONDS,
              MIN_MAX_RUNTIME_SECONDS,
            ),
            MAX_MAX_RUNTIME_SECONDS,
          )
        : null;
    const expiresAt =
      kind === 'schedule'
        ? new Date(
            Date.now() +
              Math.min(
                Math.max(
                  params.expiresInHours ?? DEFAULT_SCHEDULE_LIFETIME_HOURS,
                  MIN_LIFETIME_HOURS,
                ),
                MAX_LIFETIME_HOURS,
              ) *
                3_600_000,
          ).toISOString()
        : null;
    const rows = (await db.raw(
      `INSERT INTO ai_background_task
         (id, tenant_id, user_id, agent_id, session_id, title, kind, status, command,
          condition_command, prompt, schedule_kind, schedule_expr, resume_on_finish,
          notify_on_finish, max_runs, next_run_at, max_runtime_seconds, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        id,
        scope.tenantId,
        scope.userId,
        params.agentId,
        params.sessionId,
        params.title.slice(0, 200),
        kind,
        status,
        kind === 'script' ? params.command!.trim() : null,
        program,
        kind === 'schedule' ? params.prompt!.trim() : null,
        params.schedule?.kind ?? null,
        params.schedule?.expr ?? null,
        params.resumeOnFinish !== false,
        params.notifyOnFinish !== false,
        Math.min(Math.max(params.maxRuns ?? 100, 1), 10_000),
        nextRunAt,
        maxRuntimeSeconds,
        expiresAt,
      ],
    )) as Array<Record<string, unknown>>;
    return mapBackgroundTask(rows[0]!);
  }

  async function getById(id: string, scope: BackgroundTaskScope): Promise<BackgroundTask | null> {
    const rows = (await db.raw(
      `SELECT * FROM ai_background_task
        WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
      [id, scope.tenantId, scope.userId],
    )) as Array<Record<string, unknown>>;
    return rows[0] ? mapBackgroundTask(rows[0]) : null;
  }

  async function getByIdAnyScope(id: string): Promise<BackgroundTask | null> {
    const rows = (await db.raw('SELECT * FROM ai_background_task WHERE id = $1', [id])) as Array<
      Record<string, unknown>
    >;
    return rows[0] ? mapBackgroundTask(rows[0]) : null;
  }

  async function list(
    scope: BackgroundTaskScope,
    params: ListBackgroundTasksParams = {},
  ): Promise<{ list: BackgroundTask[]; total: number }> {
    const page = Math.max(params.page ?? 1, 1);
    const pageSize = Math.min(Math.max(params.pageSize ?? 20, 1), 100);
    const where: string[] = ['tenant_id = $1', 'user_id = $2'];
    const values: unknown[] = [scope.tenantId, scope.userId];
    if (params.sessionId) {
      values.push(params.sessionId);
      where.push(`session_id = $${values.length}`);
    }
    if (params.agentId) {
      values.push(params.agentId);
      where.push(`agent_id = $${values.length}`);
    }
    if (params.status) {
      values.push(params.status);
      where.push(`status = $${values.length}`);
    }
    if (params.keyword?.trim()) {
      values.push(`%${params.keyword.trim()}%`);
      where.push(`title ILIKE $${values.length}`);
    }
    const whereSql = where.join(' AND ');
    const countRows = (await db.raw(
      `SELECT COUNT(*)::int AS total FROM ai_background_task WHERE ${whereSql}`,
      values,
    )) as Array<{ total: number }>;
    const rows = (await db.raw(
      `SELECT * FROM ai_background_task WHERE ${whereSql}
        ORDER BY created_at DESC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, (page - 1) * pageSize],
    )) as Array<Record<string, unknown>>;
    return { list: rows.map(mapBackgroundTask), total: num(countRows[0]?.total) };
  }

  async function getRuns(
    taskId: string,
    scope: BackgroundTaskScope,
    limit = 20,
  ): Promise<BackgroundTaskRun[]> {
    const rows = (await db.raw(
      `SELECT * FROM ai_background_task_run
        WHERE task_id = $1 AND tenant_id = $2 AND user_id = $3
        ORDER BY started_at DESC
        LIMIT $4`,
      [taskId, scope.tenantId, scope.userId, Math.min(Math.max(limit, 1), 100)],
    )) as Array<Record<string, unknown>>;
    return rows.map(mapBackgroundTaskRun);
  }

  /** 活跃任务数（pending/waiting/running），用于用户级并发上限 */
  async function countActive(scope: BackgroundTaskScope): Promise<number> {
    const rows = (await db.raw(
      `SELECT COUNT(*)::int AS total FROM ai_background_task
        WHERE tenant_id = $1 AND user_id = $2
          AND status IN ('pending', 'waiting', 'running')`,
      [scope.tenantId, scope.userId],
    )) as Array<{ total: number }>;
    return num(rows[0]?.total);
  }

  /** 更新状态（带归属校验）；不存在/已终态返回 null */
  async function transition(
    id: string,
    scope: BackgroundTaskScope,
    fromStatuses: BackgroundTaskStatus[],
    patch: {
      status: BackgroundTaskStatus;
      nextRunAt?: string | null;
      lastError?: string | null;
      clearLease?: boolean;
    },
  ): Promise<BackgroundTask | null> {
    const placeholders = fromStatuses.map((_, index) => `$${index + 5}`).join(', ');
    const nextRunAtParam = 4 + fromStatuses.length + 1;
    const lastErrorParam = nextRunAtParam + 1;
    const clearLeaseParam = lastErrorParam + 1;
    const rows = (await db.raw(
      `UPDATE ai_background_task
          SET status = $4,
              next_run_at = $${nextRunAtParam},
              last_error = $${lastErrorParam},
              lease_owner = CASE WHEN $${clearLeaseParam} THEN NULL ELSE lease_owner END,
              lease_expires_at = CASE WHEN $${clearLeaseParam} THEN NULL ELSE lease_expires_at END,
              updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2 AND user_id = $3
          AND status IN (${placeholders})
        RETURNING *`,
      [
        id,
        scope.tenantId,
        scope.userId,
        patch.status,
        ...fromStatuses,
        patch.nextRunAt ?? null,
        patch.lastError ?? null,
        patch.clearLease === true,
      ],
    )) as Array<Record<string, unknown>>;
    return rows[0] ? mapBackgroundTask(rows[0]) : null;
  }

  async function cancel(id: string, scope: BackgroundTaskScope): Promise<BackgroundTask | null> {
    return transition(id, scope, ['pending', 'waiting', 'running', 'paused', 'interrupted'], {
      status: 'cancelled',
      nextRunAt: null,
      clearLease: true,
    });
  }

  async function pause(id: string, scope: BackgroundTaskScope): Promise<BackgroundTask | null> {
    return transition(id, scope, ['pending', 'waiting'], {
      status: 'paused',
      nextRunAt: null,
      clearLease: true,
    });
  }

  async function resume(id: string, scope: BackgroundTaskScope): Promise<BackgroundTask | null> {
    const current = await getById(id, scope);
    if (!current || current.status !== 'paused') return null;
    const nextRunAt =
      current.kind === 'schedule' && current.schedule
        ? (computeNextRun(current.schedule, new Date())?.toISOString() ?? null)
        : null;
    return transition(id, scope, ['paused'], {
      status: current.kind === 'script' ? 'pending' : 'waiting',
      nextRunAt,
      clearLease: true,
    });
  }

  async function remove(id: string, scope: BackgroundTaskScope): Promise<boolean> {
    const rows = (await db.raw(
      `DELETE FROM ai_background_task
        WHERE id = $1 AND tenant_id = $2 AND user_id = $3
          AND status NOT IN ('running')
        RETURNING id`,
      [id, scope.tenantId, scope.userId],
    )) as Array<{ id: string }>;
    if (rows.length === 0) return false;
    await db.raw(
      'DELETE FROM ai_background_task_run WHERE task_id = $1 AND tenant_id = $2 AND user_id = $3',
      [id, scope.tenantId, scope.userId],
    );
    return true;
  }

  /**
   * 原子领取到期任务（多实例安全）。
   * 同时把租约写成本实例、run_count + 1、last_run_at 置为现在。
   */
  async function claimDue(options: LeaseOptions & { limit?: number }): Promise<BackgroundTask[]> {
    const limit = Math.min(Math.max(options.limit ?? 5, 1), 20);
    const ttlMs = options.ttlMs ?? DEFAULT_LEASE_TTL_MS;
    const rows = (await db.raw(
      `WITH due AS (
         SELECT id FROM ai_background_task
          WHERE status IN ('pending', 'waiting')
            AND (next_run_at IS NULL OR next_run_at <= NOW())
            AND (lease_expires_at IS NULL OR lease_expires_at < NOW())
          ORDER BY next_run_at ASC NULLS FIRST, created_at ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED
       )
       UPDATE ai_background_task t
          SET status = 'running',
              lease_owner = $2,
              lease_expires_at = NOW() + ($3::text || ' milliseconds')::interval,
              run_count = run_count + 1,
              last_run_at = NOW(),
              updated_at = NOW()
         FROM due
        WHERE t.id = due.id
        RETURNING t.*`,
      [limit, options.owner, ttlMs],
    )) as Array<Record<string, unknown>>;
    return rows.map(mapBackgroundTask);
  }

  /** 立即执行：把任务重新排入执行队列（脚本任务重新启动；定时任务下一次触发时间改为现在） */
  async function enqueueNow(
    id: string,
    scope: BackgroundTaskScope,
  ): Promise<BackgroundTask | null> {
    const current = await getById(id, scope);
    if (!current || current.status === 'running' || current.status === 'cancelled') return null;
    const rows = (await db.raw(
      `UPDATE ai_background_task
          SET status = $4,
              next_run_at = CASE WHEN $4 = 'waiting' THEN NOW() ELSE NULL END,
              lease_owner = NULL, lease_expires_at = NULL,
              instance_id = NULL, sandbox_id = NULL, exec_pid = NULL,
              exec_log_path = NULL, exec_exit_path = NULL, updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2 AND user_id = $3
          AND status <> 'running' AND status <> 'cancelled'
        RETURNING *`,
      [id, scope.tenantId, scope.userId, current.kind === 'script' ? 'pending' : 'waiting'],
    )) as Array<Record<string, unknown>>;
    return rows[0] ? mapBackgroundTask(rows[0]) : null;
  }

  /** 立即执行：把任务置为 running 并返回（条件：非运行中、非终态取消） */
  async function claimManual(
    id: string,
    scope: BackgroundTaskScope,
    options: LeaseOptions,
  ): Promise<BackgroundTask | null> {
    const ttlMs = options.ttlMs ?? DEFAULT_LEASE_TTL_MS;
    const rows = (await db.raw(
      `UPDATE ai_background_task
          SET status = 'running',
              lease_owner = $4,
              lease_expires_at = NOW() + ($5::text || ' milliseconds')::interval,
              run_count = run_count + 1,
              last_run_at = NOW(),
              updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2 AND user_id = $3
          AND status IN ('pending', 'waiting', 'paused', 'completed', 'failed', 'interrupted')
        RETURNING *`,
      [id, scope.tenantId, scope.userId, options.owner, ttlMs],
    )) as Array<Record<string, unknown>>;
    return rows[0] ? mapBackgroundTask(rows[0]) : null;
  }

  /** 续租（执行中定时调用）；返回 false 表示租约已被其他实例接管 */
  async function renewLease(
    id: string,
    owner: string,
    ttlMs = DEFAULT_LEASE_TTL_MS,
  ): Promise<boolean> {
    const rows = (await db.raw(
      `UPDATE ai_background_task
          SET lease_expires_at = NOW() + ($3::text || ' milliseconds')::interval,
              updated_at = NOW()
        WHERE id = $1 AND lease_owner = $2
        RETURNING id`,
      [id, owner, ttlMs],
    )) as Array<{ id: string }>;
    return rows.length > 0;
  }

  async function clearLease(id: string, owner: string): Promise<void> {
    await db.raw(
      `UPDATE ai_background_task
          SET lease_owner = NULL, lease_expires_at = NULL, updated_at = NOW()
        WHERE id = $1 AND lease_owner = $2`,
      [id, owner],
    );
  }

  /** 记录脚本执行句柄（VM 实例 / PID / 日志与退出码文件），并落执行截止时间 */
  async function markScriptStarted(id: string, owner: string, handle: ScriptHandle): Promise<void> {
    await db.raw(
      `UPDATE ai_background_task
          SET instance_id = $3, sandbox_id = $4, exec_pid = $5,
              exec_log_path = $6, exec_exit_path = $7,
              deadline_at = NOW() + make_interval(secs => COALESCE(max_runtime_seconds, $8)),
              updated_at = NOW()
        WHERE id = $1 AND lease_owner = $2`,
      [
        id,
        owner,
        handle.instanceId,
        handle.sandboxId,
        handle.pid,
        handle.logPath,
        handle.exitPath,
        DEFAULT_SCRIPT_MAX_RUNTIME_SECONDS,
      ],
    );
  }

  /** 记录脚本执行结果（保持 running，等待 runner 决定是否唤醒会话） */
  async function markScriptOutput(
    id: string,
    patch: { exitCode: number | null; output: string | null; error?: string | null },
  ): Promise<void> {
    await db.raw(
      `UPDATE ai_background_task
          SET last_error = $2, updated_at = NOW()
        WHERE id = $1`,
      [id, truncate(patch.error ?? undefined, 2_000)],
    );
  }

  /** 结束脚本执行：写入终态（resume 场景由 runner 先做完成唤醒再调用本方法） */
  async function finishScript(
    id: string,
    status: 'completed' | 'failed' | 'cancelled' | 'interrupted',
    patch: { lastError?: string | null } = {},
  ): Promise<void> {
    await db.raw(
      `UPDATE ai_background_task
          SET status = $2,
              last_error = $3,
              lease_owner = NULL,
              lease_expires_at = NULL,
              updated_at = NOW()
        WHERE id = $1`,
      [id, status, truncate(patch.lastError ?? undefined, 2_000)],
    );
  }

  /** 调度类任务：安排下一次执行（nextRunAt=null 表示不再触发） */
  async function reschedule(
    id: string,
    owner: string,
    nextRunAt: string | null,
    lastError: string | null = null,
  ): Promise<void> {
    await db.raw(
      `UPDATE ai_background_task
          SET status = $3,
              next_run_at = $4,
              last_error = $2,
              lease_owner = NULL,
              lease_expires_at = NULL,
              updated_at = NOW()
        WHERE id = $1 AND lease_owner = $5`,
      [
        id,
        truncate(lastError ?? undefined, 2_000),
        nextRunAt ? 'waiting' : 'completed',
        nextRunAt,
        owner,
      ],
    );
  }

  /**
   * 兜底重排（runner 专用）：不要求租约归属。
   * 用于「执行实例失联」恢复：租约已被清空，无法用 owner 条件更新。
   */
  async function rescheduleAny(
    id: string,
    nextRunAt: string | null,
    lastError: string | null = null,
  ): Promise<void> {
    await db.raw(
      `UPDATE ai_background_task
          SET status = $2, next_run_at = $3, last_error = $4,
              lease_owner = NULL, lease_expires_at = NULL, updated_at = NOW()
        WHERE id = $1`,
      [id, nextRunAt ? 'waiting' : 'completed', nextRunAt, truncate(lastError ?? undefined, 2_000)],
    );
  }

  /** 写 run 台账；调度触发的同 (task_id, scheduled_at) 只允许一条（唯一索引兜底） */
  async function createRun(params: {
    task: BackgroundTask;
    trigger: BackgroundRunTrigger;
    scheduledAt?: string | null;
  }): Promise<BackgroundTaskRun | null> {
    const id = crypto.randomUUID();
    const rows = (await db.raw(
      `INSERT INTO ai_background_task_run
         (id, task_id, tenant_id, user_id, session_id, trigger, status, scheduled_at, started_at)
       VALUES ($1,$2,$3,$4,$5,$6,'running',$7,NOW())
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [
        id,
        params.task.id,
        params.task.tenantId,
        params.task.userId,
        params.task.sessionId,
        params.trigger,
        params.scheduledAt ?? null,
      ],
    )) as Array<Record<string, unknown>>;
    if (!rows[0]) return null;
    await db.raw('UPDATE ai_background_task SET last_run_id = $2 WHERE id = $1', [
      params.task.id,
      id,
    ]);
    return mapBackgroundTaskRun(rows[0]);
  }

  async function finishRun(
    runId: string,
    patch: {
      status: Exclude<BackgroundRunStatus, 'running'>;
      exitCode?: number | null;
      output?: string | null;
      error?: string | null;
      finalContent?: string | null;
    },
  ): Promise<void> {
    await db.raw(
      `UPDATE ai_background_task_run
          SET status = $2, finished_at = NOW(), exit_code = $3, output = $4,
              error = $5, final_content = $6, updated_at = NOW()
        WHERE id = $1`,
      [
        runId,
        patch.status,
        patch.exitCode ?? null,
        truncate(patch.output ?? undefined, MAX_RUN_OUTPUT_CHARS),
        truncate(patch.error ?? undefined, 4_000),
        truncate(patch.finalContent ?? undefined, MAX_FINAL_CONTENT_CHARS),
      ],
    );
  }

  /**
   * 运行中任务兜底回收：租约已过期（执行实例崩溃/被抢占）→ 标记 interrupted。
   * runOnce 每轮调用（不是只在启动时），保证没有实例重启也能自愈。
   */
  async function reclaimExpiredLeases(limit = 20): Promise<BackgroundTask[]> {
    const rows = (await db.raw(
      `UPDATE ai_background_task
          SET status = 'interrupted', lease_owner = NULL, lease_expires_at = NULL,
              last_error = COALESCE(last_error, '执行实例已失联（租约过期），任务被中断'),
              updated_at = NOW()
        WHERE id IN (
          SELECT id FROM ai_background_task
           WHERE status = 'running'
             AND lease_expires_at IS NOT NULL
             AND lease_expires_at < NOW()
           ORDER BY lease_expires_at ASC
           LIMIT $1
           FOR UPDATE SKIP LOCKED
        )
        RETURNING *`,
      [Math.min(Math.max(limit, 1), 50)],
    )) as Array<Record<string, unknown>>;
    return rows.map(mapBackgroundTask);
  }

  /** 连续失败次数 +1，返回累计值（用于「失败 N 次自动暂停」兜底） */
  async function bumpFailures(id: string): Promise<number> {
    const rows = (await db.raw(
      `UPDATE ai_background_task
          SET consecutive_failures = consecutive_failures + 1, updated_at = NOW()
        WHERE id = $1
        RETURNING consecutive_failures`,
      [id],
    )) as Array<{ consecutive_failures: number }>;
    return num(rows[0]?.consecutive_failures);
  }

  async function resetFailures(id: string): Promise<void> {
    await db.raw(
      'UPDATE ai_background_task SET consecutive_failures = 0, updated_at = NOW() WHERE id = $1',
      [id],
    );
  }

  /** 连续失败达到阈值：自动暂停并记录原因（不删除任务，用户可在面板恢复） */
  async function pauseForFailure(id: string, reason: string): Promise<BackgroundTask | null> {
    const rows = (await db.raw(
      `UPDATE ai_background_task
          SET status = 'paused', next_run_at = NULL, last_error = $2,
              lease_owner = NULL, lease_expires_at = NULL, updated_at = NOW()
        WHERE id = $1 AND status = 'running'
        RETURNING *`,
      [id, truncate(reason, 2_000)],
    )) as Array<Record<string, unknown>>;
    return rows[0] ? mapBackgroundTask(rows[0]) : null;
  }

  /** 按 id 直接结束任务（到期/兜底场景；不做归属校验，仅供 runner 使用） */
  async function finishById(
    id: string,
    status: 'completed' | 'failed' | 'cancelled' | 'interrupted',
    lastError: string | null = null,
  ): Promise<void> {
    await db.raw(
      `UPDATE ai_background_task
          SET status = $2, next_run_at = NULL, last_error = $3,
              lease_owner = NULL, lease_expires_at = NULL, updated_at = NOW()
        WHERE id = $1`,
      [id, status, truncate(lastError ?? undefined, 2_000)],
    );
  }

  /** 进程重启恢复：把租约过期仍在 running 的任务标记为 interrupted（脚本无法确认存活，保守处理） */
  async function reconcileStale(ttlMs = 0): Promise<{ tasks: number; runs: number }> {
    const taskRows = (await db.raw(
      `UPDATE ai_background_task
          SET status = 'interrupted', lease_owner = NULL, lease_expires_at = NULL,
              last_error = COALESCE(last_error, '执行实例已重启或租约过期，任务被中断'),
              updated_at = NOW()
        WHERE status = 'running'
          AND lease_expires_at IS NOT NULL
          AND lease_expires_at < NOW() + ($1::text || ' milliseconds')::interval
        RETURNING id`,
      [ttlMs],
    )) as Array<{ id: string }>;
    const runRows = (await db.raw(
      `UPDATE ai_background_task_run
          SET status = 'interrupted', finished_at = NOW(),
              error = COALESCE(error, '执行实例已重启或租约过期，运行被中断'), updated_at = NOW()
        WHERE status = 'running'
          AND started_at < NOW() - INTERVAL '30 minutes'
        RETURNING id`,
    )) as Array<{ id: string }>;
    return { tasks: taskRows.length, runs: runRows.length };
  }

  /** 运行中的脚本任务（runner 探活用；跨租户扫描，租户信息从行内取） */
  async function listRunningScripts(limit = 20): Promise<BackgroundTask[]> {
    const rows = (await db.raw(
      `SELECT * FROM ai_background_task
        WHERE status = 'running' AND kind = 'script'
        ORDER BY last_run_at ASC NULLS FIRST
        LIMIT $1`,
      [Math.min(Math.max(limit, 1), 50)],
    )) as Array<Record<string, unknown>>;
    return rows.map(mapBackgroundTask);
  }

  /** 待清理的已取消脚本句柄（取消后由 runner 负责 kill 进程并清空句柄） */
  async function listCancelledScripts(limit = 20): Promise<BackgroundTask[]> {
    const rows = (await db.raw(
      `SELECT * FROM ai_background_task
        WHERE status IN ('cancelled', 'interrupted')
          AND kind = 'script' AND sandbox_id IS NOT NULL
        LIMIT $1`,
      [Math.min(Math.max(limit, 1), 50)],
    )) as Array<Record<string, unknown>>;
    return rows.map(mapBackgroundTask);
  }

  async function clearScriptHandle(id: string): Promise<void> {
    await db.raw(
      `UPDATE ai_background_task
          SET sandbox_id = NULL, exec_pid = NULL, exec_log_path = NULL,
              exec_exit_path = NULL, updated_at = NOW()
        WHERE id = $1`,
      [id],
    );
  }

  /** 清理过期会话运行租约（防止崩溃实例的租约永久占位） */
  async function purgeExpiredSessionRuns(): Promise<number> {
    const rows = (await db.raw(
      'DELETE FROM ai_session_run WHERE expires_at < NOW() RETURNING session_id',
    )) as Array<{ session_id: string }>;
    return rows.length;
  }

  return {
    create,
    getById,
    countActive,
    getByIdAnyScope,
    list,
    getRuns,
    cancel,
    pause,
    resume,
    remove,
    claimDue,
    claimManual,
    enqueueNow,
    renewLease,
    clearLease,
    markScriptStarted,
    markScriptOutput,
    finishScript,
    reschedule,
    reclaimExpiredLeases,
    bumpFailures,
    resetFailures,
    pauseForFailure,
    finishById,
    rescheduleAny,
    createRun,
    finishRun,
    reconcileStale,
    listRunningScripts,
    listCancelledScripts,
    clearScriptHandle,
    purgeExpiredSessionRuns,
  };
}

export type BackgroundTaskService = ReturnType<typeof createBackgroundTaskService>;

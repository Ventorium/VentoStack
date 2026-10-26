import type { BackgroundScheduleKind } from '../agent-engine/background-task-schedule';
import type {
  BackgroundTask,
  BackgroundTaskService,
  BackgroundTaskStatus,
} from '../services/background-task';
/**
 * 后台任务工具 — 让 Agent 自己布置/查询/取消后台任务
 *
 * 设计要点：
 *   - 创建类工具（脚本 / 定时）标记为 high + requiresApproval：用户必须在对话里看到
 *     完整命令/提示词并批准一次，杜绝模型单方面给自己安排长期后台执行权限；
 *   - 查询/取消类工具是 low（无需审批）：这样无人值守的定时唤醒运行里，Agent 仍能
 *     读取任务状态、在目标达成时取消任务（否则会陷入「每次都要人工审批」的死锁）；
 *   - 脚本任务要求 Agent 具备虚拟机环境（fail-closed）：后台长任务不能跑在服务进程里；
 *   - 用户级并发上限默认 10（对齐业界 job runtime 的 maxConcurrentJobsPerOwner）。
 */
import type { ToolDefinition } from '../tool-registry';

export interface BackgroundTaskToolScope {
  tenantId: string;
  userId: string;
  sessionId: string;
}

export interface BackgroundTaskToolDeps {
  tasks: BackgroundTaskService;
  scope: BackgroundTaskToolScope;
  /** 当前会话的 Agent 信息（判定脚本任务是否有虚拟机执行面） */
  resolveAgent(): Promise<{ agentId: string; requiresVirtualEnvironment: boolean } | null>;
  /** 读取脚本日志尾部（VM 内 tail）；不可用时返回 null */
  readLog?(task: BackgroundTask): Promise<string | null>;
  maxActiveTasksPerUser?: number;
}

const MAX_TITLE = 120;
const MAX_COMMAND = 8_000;
const MAX_PROMPT = 8_000;
const DEFAULT_MAX_ACTIVE = 10;

const STATUS_LABELS: Record<BackgroundTaskStatus, string> = {
  pending: '待启动',
  waiting: '等待触发',
  running: '执行中',
  paused: '已暂停',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
  interrupted: '已中断',
};

function describeTask(task: BackgroundTask): Record<string, unknown> {
  return {
    id: task.id,
    title: task.title,
    kind: task.kind,
    status: task.status,
    statusLabel: STATUS_LABELS[task.status],
    schedule: task.schedule ? `${task.schedule.kind}:${task.schedule.expr}` : null,
    runCount: task.runCount,
    maxRuns: task.maxRuns,
    nextRunAt: task.nextRunAt,
    lastRunAt: task.lastRunAt,
    lastError: task.lastError,
    maxRuntimeSeconds: task.maxRuntimeSeconds,
    deadlineAt: task.deadlineAt,
    expiresAt: task.expiresAt,
    consecutiveFailures: task.consecutiveFailures,
  };
}

function normalizeScheduleKind(value: unknown): BackgroundScheduleKind | null {
  return value === 'once' || value === 'interval' || value === 'cron' ? value : null;
}

export function createBackgroundTaskTools(deps: BackgroundTaskToolDeps): ToolDefinition[] {
  const { tasks, scope } = deps;
  const maxActive = deps.maxActiveTasksPerUser ?? DEFAULT_MAX_ACTIVE;

  async function guardCreation(): Promise<
    { ok: true; agentId: string } | { ok: false; error: string }
  > {
    const agent = await deps.resolveAgent();
    if (!agent) return { ok: false, error: '当前会话缺少 Agent 信息，无法创建后台任务' };
    const active = await tasks.countActive(scope);
    if (active >= maxActive) {
      return {
        ok: false,
        error: `后台任务数量已达上限（${maxActive} 个），请先取消不再需要的任务`,
      };
    }
    return { ok: true, agentId: agent.agentId };
  }

  const start: ToolDefinition = {
    name: 'background_task_start',
    description: [
      '把一个耗时很长的 Shell 命令放到虚拟机后台执行（超大文件下载、长时间构建、批量处理等），',
      '立即返回任务 ID；会话结束后任务会继续运行，完成时系统会自动把结果带回当前会话继续对话。',
      '命令在 Agent 的 Linux 虚拟机 /workspace 下执行，可用 curl/wget/bash 等；输出会写入 .agent-logs。',
      '只有当前 Agent 绑定了虚拟机环境时可用。多个独立任务可以分别调用本工具创建。',
      '任务有最大运行时长（默认 6 小时，可用 maxRuntimeSeconds 调整），超时会被终止并标记失败，不会永久挂起。',
    ].join(''),
    parameters: [
      {
        name: 'title',
        type: 'string',
        description: '任务名称（人类可读，如「下载模型权重」），不超过 120 字',
        required: true,
        schema: { maxLength: MAX_TITLE },
      },
      {
        name: 'command',
        type: 'string',
        description: '要执行的 Shell 命令（在 /workspace 下、以 sh -lc 执行）',
        required: true,
        schema: { maxLength: MAX_COMMAND },
      },
      {
        name: 'resumeOnFinish',
        type: 'boolean',
        description: '任务完成后是否自动把结果带回当前会话继续执行（默认 true）',
        required: false,
      },
      {
        name: 'maxRuntimeSeconds',
        type: 'number',
        description:
          '最长运行时长（秒），默认 21600（6 小时），范围 60 ~ 604800（7 天）；到点强制终止并标记失败',
        required: false,
        schema: { minimum: 60, maximum: 604_800 },
      },
    ],
    riskLevel: 'high',
    requiresApproval: true,
    timeout: 30_000,
    async handler(params) {
      const title = String(params.title ?? '').trim();
      const command = String(params.command ?? '').trim();
      if (!title || title.length > MAX_TITLE) return { error: 'title 不能为空且不超过 120 字' };
      if (!command || command.length > MAX_COMMAND) {
        return { error: 'command 不能为空且不超过 8000 字' };
      }
      const agent = await deps.resolveAgent();
      if (!agent) return { error: '当前会话缺少 Agent 信息，无法创建后台任务' };
      if (!agent.requiresVirtualEnvironment) {
        return {
          error:
            '当前 Agent 未绑定虚拟机环境，无法运行后台脚本。请在 Agent 设置中开启虚拟环境后重试；定时检查类需求可用 background_task_schedule。',
        };
      }
      const guard = await guardCreation();
      if (!guard.ok) return { error: guard.error };
      try {
        const task = await tasks.create({
          scope,
          agentId: guard.agentId,
          sessionId: scope.sessionId,
          title,
          kind: 'script',
          command,
          resumeOnFinish: params.resumeOnFinish !== false,
          ...(typeof params.maxRuntimeSeconds === 'number'
            ? { maxRuntimeSeconds: params.maxRuntimeSeconds }
            : {}),
        });
        return {
          task: describeTask(task),
          message: `后台任务已创建（${task.id}），将在数秒内启动；会话可以继续或结束，任务会独立运行。`,
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
  };

  const schedule: ToolDefinition = {
    name: 'background_task_schedule',
    description: [
      '创建一个定时/周期任务：到点后系统会恢复当前会话，把你写的 prompt 当作新的用户消息唤醒你继续执行。',
      '适用于「每 10 分钟检查下载进度」「每天 9:30 查看商品价格，低于阈值时继续下单流程」这类场景。',
      '触发后你必须自己判断目标是否达成：达成时调用 background_task_cancel 结束任务，否则正常回复即可等待下次。',
      '调度规则：once=ISO 时间一次性；interval=每 N 分钟；cron=标准 5 段表达式（分 时 日 月 周）。',
      '可选 conditionCommand：每次到点先在虚拟机里执行该短命令，退出码为 0 才唤醒你（省 token）；',
      '不提供条件时会无条件唤醒。任务有 maxRuns 与有效期（默认 7 天）双兜底，连续失败 3 次会自动暂停。',
    ].join(''),
    parameters: [
      {
        name: 'title',
        type: 'string',
        description: '任务名称（如「监控显卡价格」），不超过 120 字',
        required: true,
        schema: { maxLength: MAX_TITLE },
      },
      {
        name: 'prompt',
        type: 'string',
        description: '每次唤醒时注入的指令（要自包含：检查什么、达成条件是什么、达成后做什么）',
        required: true,
        schema: { maxLength: MAX_PROMPT },
      },
      {
        name: 'scheduleType',
        type: 'string',
        description: '调度类型',
        required: true,
        schema: { enum: ['once', 'interval', 'cron'] },
      },
      {
        name: 'scheduleValue',
        type: 'string',
        description:
          '调度值：once 传 ISO 时间（如 2026-11-01T09:30:00+08:00）；interval 传分钟数（如 10）；cron 传 5 段表达式（如 */10 * * * *）',
        required: true,
        schema: { maxLength: 128 },
      },
      {
        name: 'conditionCommand',
        type: 'string',
        description: '可选：唤醒前在虚拟机执行的检查命令（退出码 0 = 满足条件，才唤醒）',
        required: false,
        schema: { maxLength: 4_000 },
      },
      {
        name: 'maxRuns',
        type: 'number',
        description: '最多触发次数（默认 100，达到后任务自动完成）',
        required: false,
        schema: { minimum: 1, maximum: 10_000 },
      },
      {
        name: 'expiresInHours',
        type: 'number',
        description:
          '任务有效期（小时），默认 168（7 天），范围 1 ~ 720；到期自动结束，避免遗忘的任务无限触发',
        required: false,
        schema: { minimum: 1, maximum: 720 },
      },
    ],
    riskLevel: 'high',
    requiresApproval: true,
    timeout: 30_000,
    async handler(params) {
      const title = String(params.title ?? '').trim();
      const prompt = String(params.prompt ?? '').trim();
      const kind = normalizeScheduleKind(params.scheduleType);
      const expr = String(params.scheduleValue ?? '').trim();
      if (!title || title.length > MAX_TITLE) return { error: 'title 不能为空且不超过 120 字' };
      if (!prompt || prompt.length > MAX_PROMPT) {
        return { error: 'prompt 不能为空且不超过 8000 字' };
      }
      if (!kind) return { error: 'scheduleType 必须是 once / interval / cron 之一' };
      if (!expr) return { error: 'scheduleValue 不能为空' };
      const guard = await guardCreation();
      if (!guard.ok) return { error: guard.error };
      const conditionCommand = String(params.conditionCommand ?? '').trim() || undefined;
      if (conditionCommand) {
        const agent = await deps.resolveAgent();
        if (!agent?.requiresVirtualEnvironment) {
          return { error: 'conditionCommand 需要虚拟机环境；请去掉该参数或为 Agent 开启虚拟机' };
        }
      }
      try {
        const task = await tasks.create({
          scope,
          agentId: guard.agentId,
          sessionId: scope.sessionId,
          title,
          kind: 'schedule',
          prompt,
          schedule: { kind, expr },
          ...(conditionCommand ? { conditionCommand } : {}),
          maxRuns: typeof params.maxRuns === 'number' ? params.maxRuns : 100,
          ...(typeof params.expiresInHours === 'number'
            ? { expiresInHours: params.expiresInHours }
            : {}),
        });
        return {
          task: describeTask(task),
          message: `定时任务已创建（${task.id}），下次触发时间：${task.nextRunAt ?? '无'}。`,
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
  };

  const list: ToolDefinition = {
    name: 'background_task_list',
    description:
      '列出后台任务（默认当前会话，可切换为用户全部任务），返回状态、下次触发时间与最近错误。',
    parameters: [
      {
        name: 'scope',
        type: 'string',
        description: 'session=当前会话（默认）；user=当前用户全部任务',
        required: false,
        schema: { enum: ['session', 'user'] },
      },
      {
        name: 'status',
        type: 'string',
        description: '按状态过滤（可选）',
        required: false,
        schema: {
          enum: ['pending', 'waiting', 'running', 'paused', 'completed', 'failed', 'cancelled'],
        },
      },
      {
        name: 'limit',
        type: 'number',
        description: '最多返回条数（默认 20，上限 50）',
        required: false,
        schema: { minimum: 1, maximum: 50 },
      },
    ],
    riskLevel: 'low',
    timeout: 15_000,
    async handler(params) {
      const status = params.status as BackgroundTaskStatus | undefined;
      const limit = Math.min(Math.max(Number(params.limit ?? 20), 1), 50);
      const result = await tasks.list(scope, {
        ...(params.scope === 'user' ? {} : { sessionId: scope.sessionId }),
        ...(status ? { status } : {}),
        page: 1,
        pageSize: limit,
      });
      return {
        total: result.total,
        tasks: result.list.map(describeTask),
      };
    },
  };

  const status: ToolDefinition = {
    name: 'background_task_status',
    description:
      '查看单个后台任务的详情与最近运行记录；脚本任务可附带日志尾部（includeLog=true）。',
    parameters: [
      {
        name: 'taskId',
        type: 'string',
        description: '任务 ID',
        required: true,
        schema: { maxLength: 64 },
      },
      {
        name: 'includeLog',
        type: 'boolean',
        description: '是否读取脚本日志尾部（默认 false）',
        required: false,
      },
    ],
    riskLevel: 'low',
    timeout: 20_000,
    async handler(params) {
      const task = await tasks.getById(String(params.taskId ?? ''), scope);
      if (!task) return { error: '任务不存在或不属于当前用户' };
      const runs = await tasks.getRuns(task.id, scope, 5);
      const log =
        params.includeLog === true && task.kind === 'script' && deps.readLog
          ? await deps.readLog(task).catch(() => null)
          : null;
      return {
        task: describeTask(task),
        runs: runs.map((run) => ({
          id: run.id,
          trigger: run.trigger,
          status: run.status,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
          exitCode: run.exitCode,
          error: run.error,
          output: run.output ? run.output.slice(0, 500) : null,
        })),
        ...(log === null ? {} : { log: log.slice(0, 4_000) }),
      };
    },
  };

  const cancel: ToolDefinition = {
    name: 'background_task_cancel',
    description:
      '取消后台任务：不传 taskId 时取消当前会话全部活跃任务；已取消的脚本任务会终止对应进程。',
    parameters: [
      {
        name: 'taskId',
        type: 'string',
        description: '要取消的任务 ID（缺省 = 当前会话全部活跃任务）',
        required: false,
        schema: { maxLength: 64 },
      },
    ],
    riskLevel: 'low',
    timeout: 15_000,
    async handler(params) {
      const taskId = typeof params.taskId === 'string' ? params.taskId.trim() : '';
      if (taskId) {
        const task = await tasks.getById(taskId, scope);
        if (!task) return { error: '任务不存在或不属于当前用户' };
        const cancelled = await tasks.cancel(task.id, scope);
        return cancelled
          ? { cancelled: [describeTask(cancelled)] }
          : { error: '任务已结束，无法取消' };
      }
      const active = await tasks.list(scope, { sessionId: scope.sessionId, page: 1, pageSize: 50 });
      const targets = active.list.filter(
        (task) =>
          task.status === 'pending' ||
          task.status === 'waiting' ||
          task.status === 'running' ||
          task.status === 'paused',
      );
      const cancelled: Array<Record<string, unknown>> = [];
      for (const task of targets) {
        const result = await tasks.cancel(task.id, scope);
        if (result) cancelled.push(describeTask(result));
      }
      return { cancelled, count: cancelled.length };
    },
  };

  return [start, schedule, list, status, cancel];
}

/**
 * 工具目录（供全局工具注册表列出，供 Agent 编辑页勾选）。
 *
 * 真正的 handler 需要请求级会话作用域（tenant/user/session），因此目录里的 handler
 * 只用于展示（被直接调用会抛错）；实际执行走 `buildBaseToolRegistry` 按请求创建的实例。
 */
export function createBackgroundTaskToolCatalog(): ToolDefinition[] {
  const notInSession = async (): Promise<never> => {
    throw new Error('后台任务工具只能在会话内的 Agent 运行中调用');
  };
  return createBackgroundTaskTools({
    // 目录只为拿工具元数据，不会执行 handler（handler 已被替换）
    tasks: {} as BackgroundTaskService,
    scope: { tenantId: '', userId: '', sessionId: '' },
    resolveAgent: async () => null,
  }).map((tool) => ({ ...tool, handler: notInSession }));
}

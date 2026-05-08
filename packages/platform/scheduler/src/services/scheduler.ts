/**
 * @ventostack/scheduler - 定时任务管理服务
 *
 * 对接 @ventostack/events 的 Scheduler，提供 DB 持久化、任务 CRUD、执行日志。
 */

import type { Database } from "@ventostack/database";
import type { Scheduler } from "@ventostack/events";
import { ScheduleJobModel, ScheduleJobLogModel } from "../models";

/** 任务状态枚举 */
export const JobStatus = { PAUSED: 0, RUNNING: 1 } as const;

/** 日志状态枚举 */
export const LogStatus = { FAILED: 0, SUCCESS: 1, RUNNING: 2 } as const;

/** 创建任务参数 */
export interface CreateJobParams {
  name: string;
  handlerId: string;
  cron?: string;
  params?: Record<string, unknown>;
  description?: string;
}

/** 任务详情 */
export interface ScheduleJob {
  id: string;
  name: string;
  handlerId: string;
  cron: string | null;
  params: Record<string, unknown> | null;
  status: number;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 任务日志 */
export interface ScheduleJobLog {
  id: string;
  jobId: string;
  startAt: string;
  endAt: string | null;
  status: number;
  result: string | null;
  error: string | null;
  durationMs: number | null;
}

/** 分页结果 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 任务处理器注册表 */
export type JobHandlerMap = Record<string, (params?: Record<string, unknown>) => Promise<void> | void>;

/** 调度服务接口 */
export interface SchedulerService {
  create(params: CreateJobParams): Promise<{ id: string }>;
  update(id: string, params: Partial<CreateJobParams>): Promise<void>;
  delete(id: string): Promise<void>;
  getById(id: string): Promise<ScheduleJob | null>;
  list(params?: { status?: number; page?: number; pageSize?: number }): Promise<PaginatedResult<ScheduleJob>>;
  start(id: string): Promise<void>;
  stop(id: string): Promise<void>;
  executeNow(id: string): Promise<void>;
  listLogs(params: { jobId?: string; status?: number; page?: number; pageSize?: number }): Promise<PaginatedResult<ScheduleJobLog>>;
}

export function createSchedulerService(deps: {
  db: Database;
  scheduler: Scheduler;
  handlers: JobHandlerMap;
}): SchedulerService {
  const { db, scheduler, handlers } = deps;

  /** In-memory map of running scheduled tasks: jobId -> ScheduledTask */
  const runningTasks = new Map<string, { stop: () => void }>();

  async function writeLog(jobId: string, status: number, result?: string, error?: string, durationMs?: number) {
    await db.query(ScheduleJobLogModel).insert({
      id: crypto.randomUUID(),
      job_id: jobId,
      start_at: new Date(),
      end_at: new Date(),
      status,
      result: result ?? null,
      error: error ?? null,
      duration_ms: durationMs ?? null,
    });
  }

  async function getByIdInternal(id: string): Promise<ScheduleJob | null> {
    const row = await db.query(ScheduleJobModel)
      .where("id", "=", id)
      .select("id", "name", "handler_id", "cron", "params", "status", "description", "created_at", "updated_at")
      .get();
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      handlerId: row.handler_id,
      cron: row.cron ?? null,
      params: row.params ? JSON.parse(row.params as string) : null,
      status: row.status,
      description: row.description ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  function getInterval(cron: string | undefined): number {
    if (!cron) return 60_000;
    // Simple cron-to-interval parsing (matches events/scheduler.ts logic)
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return 60_000;
    const [minute, hour] = parts;
    if (minute?.startsWith("*/")) {
      const n = Number.parseInt(minute.slice(2), 10);
      if (n > 0) return n * 60_000;
    }
    if (minute === "0" && hour !== undefined && hour.startsWith("*/")) {
      const n = Number.parseInt(hour.slice(2), 10);
      if (n > 0) return n * 3_600_000;
    }
    if (minute === "*" && hour === "*") return 60_000;
    if (minute === "0" && hour === "*") return 3_600_000;
    if (minute === "0" && hour === "0") return 86_400_000;
    return 60_000;
  }

  async function scheduleJob(job: ScheduleJob) {
    const handler = handlers[job.handlerId];
    if (!handler) return;

    const task = scheduler.schedule(
      {
        name: job.name,
        interval: getInterval(job.cron ?? undefined),
        onBeforeExecute: async () => {
          await writeLog(job.id, LogStatus.RUNNING);
        },
        onAfterExecute: async ({ duration }) => {
          // Update last log entry — UPDATE...ORDER BY...LIMIT, keep as db.raw
          await db.raw(
            `UPDATE sys_schedule_job_log SET end_at = NOW(), status = $1, duration_ms = $2
             WHERE job_id = $3 AND status = $4 ORDER BY start_at DESC LIMIT 1`,
            [LogStatus.SUCCESS, duration, job.id, LogStatus.RUNNING],
          );
        },
        onError: async ({ error, duration }) => {
          await db.raw(
            `UPDATE sys_schedule_job_log SET end_at = NOW(), status = $1, error = $2, duration_ms = $3
             WHERE job_id = $4 AND status = $5 ORDER BY start_at DESC LIMIT 1`,
            [LogStatus.FAILED, error.message, duration, job.id, LogStatus.RUNNING],
          );
        },
      },
      async () => {
        const params = job.params as Record<string, unknown> | null ?? undefined;
        await handler(params);
      },
    );

    runningTasks.set(job.id, task);
  }

  return {
    async create(params) {
      const id = crypto.randomUUID();
      const { name, handlerId, cron, params: jobParams, description } = params;

      await db.query(ScheduleJobModel).insert({
        id,
        name,
        handler_id: handlerId,
        cron: cron ?? null,
        params: jobParams ? JSON.stringify(jobParams) : null,
        status: 0,
        description: description ?? null,
      });

      return { id };
    },

    async update(id, params) {
      const updates: Record<string, unknown> = {};
      if (params.name !== undefined) updates.name = params.name;
      if (params.handlerId !== undefined) updates.handler_id = params.handlerId;
      if (params.cron !== undefined) updates.cron = params.cron;
      if (params.params !== undefined) updates.params = JSON.stringify(params.params);
      if (params.description !== undefined) updates.description = params.description;

      if (Object.keys(updates).length === 0) return;
      await db.query(ScheduleJobModel).where("id", "=", id).update(updates);

      // If running, restart with new config
      const existing = runningTasks.get(id);
      if (existing) {
        existing.stop();
        runningTasks.delete(id);
        const job = await getByIdInternal(id);
        if (job && job.status === JobStatus.RUNNING) {
          await scheduleJob(job);
        }
      }
    },

    async delete(id) {
      const existing = runningTasks.get(id);
      if (existing) {
        existing.stop();
        runningTasks.delete(id);
      }
      await db.query(ScheduleJobLogModel).where("job_id", "=", id).hardDelete();
      await db.query(ScheduleJobModel).where("id", "=", id).hardDelete();
    },

    async getById(id) {
      return getByIdInternal(id);
    },

    async list(params) {
      const { status, page = 1, pageSize = 10 } = params ?? {};

      let query = db.query(ScheduleJobModel);
      if (status !== undefined) query = query.where("status", "=", status);

      const total = await query.count();

      const rows = await query
        .select("id", "name", "handler_id", "cron", "params", "status", "description", "created_at", "updated_at")
        .orderBy("created_at", "desc")
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .list();

      const items = rows.map((row) => ({
        id: row.id,
        name: row.name,
        handlerId: row.handler_id,
        cron: row.cron ?? null,
        params: row.params ? JSON.parse(row.params as string) : null,
        status: row.status,
        description: row.description ?? null,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      }));

      return { items, total, page, pageSize, totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0 };
    },

    async start(id) {
      await db.query(ScheduleJobModel).where("id", "=", id).update({ status: JobStatus.RUNNING });

      const job = await getByIdInternal(id);
      if (job) await scheduleJob(job);
    },

    async stop(id) {
      await db.query(ScheduleJobModel).where("id", "=", id).update({ status: JobStatus.PAUSED });

      const existing = runningTasks.get(id);
      if (existing) {
        existing.stop();
        runningTasks.delete(id);
      }
    },

    async executeNow(id) {
      const job = await getByIdInternal(id);
      if (!job) throw new Error("任务不存在");

      const handler = handlers[job.handlerId];
      if (!handler) throw new Error(`Handler "${job.handlerId}" not registered`);

      const startMs = Date.now();
      await writeLog(id, LogStatus.RUNNING);
      try {
        const params = job.params as Record<string, unknown> | null ?? undefined;
        await handler(params);
        const duration = Date.now() - startMs;
        // UPDATE...ORDER BY...LIMIT, keep as db.raw
        await db.raw(
          `UPDATE sys_schedule_job_log SET end_at = NOW(), status = $1, duration_ms = $2
           WHERE job_id = $3 AND status = $4 ORDER BY start_at DESC LIMIT 1`,
          [LogStatus.SUCCESS, duration, id, LogStatus.RUNNING],
        );
      } catch (err) {
        const duration = Date.now() - startMs;
        await db.raw(
          `UPDATE sys_schedule_job_log SET end_at = NOW(), status = $1, error = $2, duration_ms = $3
           WHERE job_id = $4 AND status = $5 ORDER BY start_at DESC LIMIT 1`,
          [LogStatus.FAILED, (err as Error).message, duration, id, LogStatus.RUNNING],
        );
        throw err;
      }
    },

    async listLogs(params) {
      const { jobId, status, page = 1, pageSize = 10 } = params;

      let query = db.query(ScheduleJobLogModel);
      if (jobId) query = query.where("job_id", "=", jobId);
      if (status !== undefined) query = query.where("status", "=", status);

      const total = await query.count();

      const rows = await query
        .select("id", "job_id", "start_at", "end_at", "status", "result", "error", "duration_ms")
        .orderBy("start_at", "desc")
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .list();

      const items = rows.map((row) => ({
        id: row.id,
        jobId: row.job_id,
        startAt: row.start_at.toISOString(),
        endAt: row.end_at?.toISOString() ?? null,
        status: row.status,
        result: row.result ?? null,
        error: row.error ?? null,
        durationMs: row.duration_ms != null ? Number(row.duration_ms) : null,
      }));

      return { items, total, page, pageSize, totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0 };
    },
  };
}

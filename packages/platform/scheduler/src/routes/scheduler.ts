/**
 * @ventostack/scheduler - 定时任务路由
 */

import { createRouter } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import type { SchedulerService } from "../services/scheduler";
import { ok, okPage, fail, parseBody, pageOf } from "./common";

export function createSchedulerRoutes(
  schedulerService: SchedulerService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  // List jobs
  router.get("/api/scheduler/jobs", perm("scheduler", "job:list"), async (ctx) => {
    const q = ctx.query as Record<string, unknown>;
    const { page, pageSize } = pageOf(q);
    const result = await schedulerService.list({
      status: q.status !== undefined ? Number(q.status) : undefined,
      page,
      pageSize,
    });
    return okPage(result.items, result.total, result.page, result.pageSize);
  });

  // Get job by ID
  router.get("/api/scheduler/jobs/:id", perm("scheduler", "job:query"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const job = await schedulerService.getById(id);
    if (!job) return fail("任务不存在", 404, 404);
    return ok(job);
  });

  // Create job
  router.post("/api/scheduler/jobs", perm("scheduler", "job:create"), async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const result = await schedulerService.create(body as any);
      return ok(result);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "创建失败", 400);
    }
  });

  // Update job
  router.put("/api/scheduler/jobs/:id", perm("scheduler", "job:update"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const body = await parseBody(ctx.request);
    await schedulerService.update(id, body as any);
    return ok(null);
  });

  // Delete job
  router.delete("/api/scheduler/jobs/:id", perm("scheduler", "job:delete"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    await schedulerService.delete(id);
    return ok(null);
  });

  // Start job
  router.put("/api/scheduler/jobs/:id/start", perm("scheduler", "job:update"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    await schedulerService.start(id);
    return ok(null);
  });

  // Stop job
  router.put("/api/scheduler/jobs/:id/stop", perm("scheduler", "job:update"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    await schedulerService.stop(id);
    return ok(null);
  });

  // Execute job immediately
  router.post("/api/scheduler/jobs/:id/execute", perm("scheduler", "job:update"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    try {
      await schedulerService.executeNow(id);
      return ok(null);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "执行失败", 500);
    }
  });

  // List logs
  router.get("/api/scheduler/logs", perm("scheduler", "job:list"), async (ctx) => {
    const q = ctx.query as Record<string, unknown>;
    const { page, pageSize } = pageOf(q);
    const result = await schedulerService.listLogs({
      jobId: q.jobId as string | undefined,
      status: q.status !== undefined ? Number(q.status) : undefined,
      page,
      pageSize,
    });
    return okPage(result.items, result.total, result.page, result.pageSize);
  });

  return router;
}

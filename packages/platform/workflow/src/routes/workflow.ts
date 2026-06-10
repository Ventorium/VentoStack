/**
 * @ventostack/workflow — 工作流路由
 */

import { createRouter, VentoStackError } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import type { WorkflowService } from "../services";
import { fail, ok, okPage, pageOf, parseBody } from "./common";

/** 统一错误处理 */
function handleError(e: unknown): Response {
  if (e instanceof VentoStackError) {
    return new Response(
      JSON.stringify({ code: 0, error: e.errorCode, message: e.message }),
      { status: e.code >= 400 && e.code < 600 ? e.code : 200, headers: { "Content-Type": "application/json" } },
    );
  }
  return fail(e instanceof Error ? e.message : "服务器内部错误", 500, 500);
}

export function createWorkflowRoutes(
  service: WorkflowService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  // === 定义 CRUD ===

  router.post("/api/workflow/definitions", perm("workflow", "create"), async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const result = await service.createDefinition(body as Parameters<WorkflowService["createDefinition"]>[0]);
      return ok(result);
    } catch (e) { return handleError(e); }
  });

  router.get("/api/workflow/definitions", perm("workflow", "list"), async (ctx) => {
    const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
    const q = ctx.query as Record<string, unknown>;
    const result = await service.listDefinitions({
      status: q.status !== undefined ? Number(q.status) : undefined,
      category: q.category as string | undefined,
      page,
      pageSize,
    });
    return okPage(result.items, result.total, result.page, result.pageSize);
  });

  router.get("/api/workflow/definitions/:id", perm("workflow", "query"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const def = await service.getDefinition(id);
    if (!def) return fail("流程定义不存在", 404, 404);
    return ok(def);
  });

  router.put("/api/workflow/definitions/:id", perm("workflow", "update"), async (ctx) => {
    try {
      const id = (ctx.params as Record<string, string>).id!;
      const body = await parseBody(ctx.request);
      await service.updateDefinition(id, body as Parameters<WorkflowService["updateDefinition"]>[1]);
      return ok(null);
    } catch (e) { return handleError(e); }
  });

  router.delete("/api/workflow/definitions/:id", perm("workflow", "delete"), async (ctx) => {
    try {
      const id = (ctx.params as Record<string, string>).id!;
      await service.deleteDefinition(id);
      return ok(null);
    } catch (e) { return handleError(e); }
  });

  router.post("/api/workflow/definitions/:id/publish", perm("workflow", "update"), async (ctx) => {
    try {
      const id = (ctx.params as Record<string, string>).id!;
      await service.publishDefinition(id);
      return ok(null);
    } catch (e) { return handleError(e); }
  });

  router.post("/api/workflow/definitions/:id/disable", perm("workflow", "update"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    await service.disableDefinition(id);
    return ok(null);
  });

  router.post("/api/workflow/definitions/:id/clone", perm("workflow", "create"), async (ctx) => {
    try {
      const id = (ctx.params as Record<string, string>).id!;
      const result = await service.cloneDefinition(id);
      return ok(result);
    } catch (e) { return handleError(e); }
  });

  // === 设计器 ===

  router.get("/api/workflow/definitions/:id/graph", perm("workflow", "query"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const graph = await service.getGraph(id);
    return ok(graph);
  });

  router.put("/api/workflow/definitions/:id/graph", perm("workflow", "update"), async (ctx) => {
    try {
      const id = (ctx.params as Record<string, string>).id!;
      const body = await parseBody(ctx.request);
      await service.saveGraph(id, body as { nodes: unknown[]; edges: unknown[] });
      return ok(null);
    } catch (e) { return handleError(e); }
  });

  router.post("/api/workflow/definitions/:id/graph/validate", perm("workflow", "query"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const result = await service.validateGraphData(id);
    return ok(result);
  });

  // === 实例 ===

  router.post("/api/workflow/instances", perm("workflow", "create"), async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const user = ctx.user as { id: string };
      const result = await service.startInstance({
        definitionId: body.definitionId as string,
        initiatorId: user.id,
        businessType: body.businessType as string | undefined,
        businessId: body.businessId as string | undefined,
        title: body.title as string | undefined,
        formData: (body.formData as Record<string, unknown>) ?? {},
        variables: body.variables as Record<string, unknown> | undefined,
      });
      return ok(result);
    } catch (e) { return handleError(e); }
  });

  router.get("/api/workflow/instances", perm("workflow", "list"), async (ctx) => {
    const user = ctx.user as { id: string };
    const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
    const result = await service.listMyInstances(user.id, { page, pageSize });
    return okPage(result.items, result.total, result.page, result.pageSize);
  });

  router.get("/api/workflow/instances/:id", perm("workflow", "query"), async (ctx) => {
    try {
      const id = (ctx.params as Record<string, string>).id!;
      const detail = await service.getInstanceDetail(id);
      if (!detail) return fail("实例不存在", 404, 404);
      return ok(detail);
    } catch (e) { return handleError(e); }
  });

  router.post("/api/workflow/instances/:id/withdraw", perm("workflow", "update"), async (ctx) => {
    try {
      const id = (ctx.params as Record<string, string>).id!;
      const user = ctx.user as { id: string };
      const body = await parseBody(ctx.request);
      await service.withdrawInstance(id, user.id, body.comment as string | undefined);
      return ok(null);
    } catch (e) { return handleError(e); }
  });

  router.get("/api/workflow/instances/:id/history", perm("workflow", "query"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const history = await service.getInstanceHistory(id);
    return ok(history);
  });

  // === 任务 ===

  router.get("/api/workflow/tasks", perm("workflow", "list"), async (ctx) => {
    const user = ctx.user as { id: string };
    const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
    const q = ctx.query as Record<string, unknown>;
    const result = await service.listMyTasks(user.id, {
      status: q.status !== undefined ? Number(q.status) : undefined,
      page,
      pageSize,
    });
    return okPage(result.items, result.total, result.page, result.pageSize);
  });

  router.get("/api/workflow/tasks/done", perm("workflow", "list"), async (ctx) => {
    const user = ctx.user as { id: string };
    const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
    const result = await service.listMyDoneTasks(user.id, { page, pageSize });
    return okPage(result.items, result.total, result.page, result.pageSize);
  });

  router.post("/api/workflow/tasks/:id/approve", perm("workflow", "approve"), async (ctx) => {
    try {
      const id = (ctx.params as Record<string, string>).id!;
      const user = ctx.user as { id: string };
      const body = await parseBody(ctx.request);
      await service.approveTask(id, user.id, body.comment as string | undefined);
      return ok(null);
    } catch (e) { return handleError(e); }
  });

  router.post("/api/workflow/tasks/:id/reject", perm("workflow", "reject"), async (ctx) => {
    try {
      const id = (ctx.params as Record<string, string>).id!;
      const user = ctx.user as { id: string };
      const body = await parseBody(ctx.request);
      await service.rejectTask(id, user.id, body.comment as string | undefined);
      return ok(null);
    } catch (e) { return handleError(e); }
  });

  router.post("/api/workflow/tasks/:id/transfer", perm("workflow", "approve"), async (ctx) => {
    try {
      const id = (ctx.params as Record<string, string>).id!;
      const user = ctx.user as { id: string };
      const body = await parseBody(ctx.request);
      await service.transferTask(id, user.id, body.targetUserId as string, body.comment as string | undefined);
      return ok(null);
    } catch (e) { return handleError(e); }
  });

  router.post("/api/workflow/tasks/:id/add-sign", perm("workflow", "approve"), async (ctx) => {
    try {
      const id = (ctx.params as Record<string, string>).id!;
      const user = ctx.user as { id: string };
      const body = await parseBody(ctx.request);
      await service.addSign(id, user.id, body.targetUserIds as string[], body.comment as string | undefined);
      return ok(null);
    } catch (e) { return handleError(e); }
  });

  router.post("/api/workflow/tasks/:id/urge", perm("workflow", "approve"), async (ctx) => {
    try {
      const id = (ctx.params as Record<string, string>).id!;
      const user = ctx.user as { id: string };
      await service.urgeTask(id, user.id);
      return ok(null);
    } catch (e) { return handleError(e); }
  });

  return router;
}

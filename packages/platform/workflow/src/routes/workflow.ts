/**
 * @ventostack/workflow — 工作流路由
 */

import { VentoStackError, createRouter, fail, pageOf, paginated, parseBody, success } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import type { WorkflowService } from "../services";

function handleError(e: unknown): Response {
  if (e instanceof VentoStackError) {
    return new Response(
      JSON.stringify({ code: 0, error: e.errorCode, message: e.message }),
      { status: e.code >= 400 && e.code < 600 ? e.code : 200, headers: { "Content-Type": "application/json" } },
    );
  }
  return fail("服务器内部错误", 500, 500);
}

interface WorkflowAuthUser {
  id: string;
  tenantId?: string | null;
}

function getActor(ctx: { user?: unknown }): { userId: string; tenantId: string } {
  const user = ctx.user as WorkflowAuthUser | undefined;
  return { userId: user?.id ?? "", tenantId: user?.tenantId ?? "default" };
}

export function createWorkflowRoutes(
  service: WorkflowService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  // === 定义 CRUD ===

  router.post("/api/workflow/definitions", perm("workflow", "definition:create"), async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const { userId, tenantId } = getActor(ctx);
      const params = body as unknown as Parameters<WorkflowService["createDefinition"]>[0];
      params.createdBy = userId;
      params.tenantId = tenantId;
      const result = await service.createDefinition(params);
      return success(result);
    } catch (e) { return handleError(e); }
  });

  router.get("/api/workflow/definitions", perm("workflow", "definition:list"), async (ctx) => {
    const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
    const q = ctx.query as Record<string, unknown>;
    const { tenantId } = getActor(ctx);
    const params: Parameters<WorkflowService["listDefinitions"]>[0] = { tenantId, page, pageSize };
    if (q.status !== undefined) params.status = Number(q.status);
    if (typeof q.category === "string") params.category = q.category;
    if (typeof q.businessType === "string") params.businessType = q.businessType;
    const result = await service.listDefinitions(params);
    return paginated(result.items, result.total, result.page, result.pageSize);
  });

  router.get("/api/workflow/definitions/by-business-type/:type", perm("workflow", "definition:query"), async (ctx) => {
    try {
      const bizType = (ctx.params as Record<string, string>).type!;
      const { tenantId } = getActor(ctx);
      const def = await service.getDefinitionByBusinessType(bizType, tenantId);
      if (!def) return fail("未找到该业务类型对应的流程定义", 404, 404);
      return success(def);
    } catch (e) { return handleError(e); }
  });

  router.get("/api/workflow/definitions/:id", perm("workflow", "definition:query"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const { tenantId } = getActor(ctx);
    const def = await service.getDefinition(id, tenantId);
    if (!def) return fail("流程定义不存在", 404, 404);
    return success(def);
  });

  router.put("/api/workflow/definitions/:id", perm("workflow", "definition:update"), async (ctx) => {
    try {
      const id = (ctx.params as Record<string, string>).id!;
      const body = await parseBody(ctx.request);
      const { tenantId } = getActor(ctx);
      await service.updateDefinition(id, body as Parameters<WorkflowService["updateDefinition"]>[1], tenantId);
      return success(null);
    } catch (e) { return handleError(e); }
  });

  router.delete("/api/workflow/definitions/:id", perm("workflow", "definition:delete"), async (ctx) => {
    try {
      const id = (ctx.params as Record<string, string>).id!;
      const { tenantId } = getActor(ctx);
      await service.deleteDefinition(id, tenantId);
      return success(null);
    } catch (e) { return handleError(e); }
  });

  router.post("/api/workflow/definitions/:id/publish", perm("workflow", "definition:publish"), async (ctx) => {
    try {
      const id = (ctx.params as Record<string, string>).id!;
      const { tenantId } = getActor(ctx);
      await service.publishDefinition(id, tenantId);
      return success(null);
    } catch (e) { return handleError(e); }
  });

  router.post("/api/workflow/definitions/:id/disable", perm("workflow", "definition:disable"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const { tenantId } = getActor(ctx);
    await service.disableDefinition(id, tenantId);
    return success(null);
  });

  router.post("/api/workflow/definitions/:id/clone", perm("workflow", "definition:create"), async (ctx) => {
    try {
      const id = (ctx.params as Record<string, string>).id!;
      const { tenantId } = getActor(ctx);
      const result = await service.cloneDefinition(id, tenantId);
      return success(result);
    } catch (e) { return handleError(e); }
  });

  // === 设计器 ===

  router.get("/api/workflow/definitions/:id/graph", perm("workflow", "definition:query"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const { tenantId } = getActor(ctx);
    const graph = await service.getGraph(id, tenantId);
    return success(graph);
  });

  router.put("/api/workflow/definitions/:id/graph", perm("workflow", "definition:update"), async (ctx) => {
    try {
      const id = (ctx.params as Record<string, string>).id!;
      const body = await parseBody(ctx.request);
      const { tenantId } = getActor(ctx);
      await service.saveGraph(id, body as { nodes: unknown[]; edges: unknown[] }, tenantId);
      return success(null);
    } catch (e) { return handleError(e); }
  });

  router.post("/api/workflow/definitions/:id/graph/validate", perm("workflow", "definition:query"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const { tenantId } = getActor(ctx);
    const result = await service.validateGraphData(id, tenantId);
    return success(result);
  });

  // === 实例 ===

  router.post("/api/workflow/instances", perm("workflow", "instance:create"), async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const { userId, tenantId } = getActor(ctx);
      const params: Parameters<WorkflowService["startInstance"]>[0] = {
        definitionId: body.definitionId as string,
        initiatorId: userId,
        formData: (body.formData as Record<string, unknown>) ?? {},
        tenantId,
      };
      if (typeof body.businessType === "string") params.businessType = body.businessType;
      if (typeof body.businessId === "string") params.businessId = body.businessId;
      if (typeof body.title === "string") params.title = body.title;
      if (body.variables && typeof body.variables === "object") {
        params.variables = body.variables as Record<string, unknown>;
      }
      const result = await service.startInstance(params);
      return success(result);
    } catch (e) { return handleError(e); }
  });

  router.get("/api/workflow/instances", perm("workflow", "instance:list"), async (ctx) => {
    const { userId, tenantId } = getActor(ctx);
    const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
    const q = ctx.query as Record<string, unknown>;
    const bizType = q.businessType as string | undefined;
    const bizId = q.businessId as string | undefined;
    if (bizType) {
      const result = await service.listInstancesByBusiness(bizType, bizId, { page, pageSize, tenantId });
      return paginated(result.items, result.total, result.page, result.pageSize);
    }
    const result = await service.listMyInstances(userId, { page, pageSize, tenantId });
    return paginated(result.items, result.total, result.page, result.pageSize);
  });

  router.get("/api/workflow/instances/:id", perm("workflow", "instance:query"), async (ctx) => {
    try {
      const id = (ctx.params as Record<string, string>).id!;
      const { tenantId } = getActor(ctx);
      const detail = await service.getInstanceDetail(id, tenantId);
      if (!detail) return fail("实例不存在", 404, 404);
      return success(detail);
    } catch (e) { return handleError(e); }
  });

  router.post("/api/workflow/instances/:id/withdraw", perm("workflow", "instance:update"), async (ctx) => {
    try {
      const id = (ctx.params as Record<string, string>).id!;
      const { userId, tenantId } = getActor(ctx);
      const body = await parseBody(ctx.request);
      await service.withdrawInstance(id, userId, body.comment as string | undefined, tenantId);
      return success(null);
    } catch (e) { return handleError(e); }
  });

  router.get("/api/workflow/instances/:id/history", perm("workflow", "instance:query"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const { tenantId } = getActor(ctx);
    const history = await service.getInstanceHistory(id, tenantId);
    return success(history);
  });

  // === 任务 ===

  router.get("/api/workflow/tasks", perm("workflow", "task:list"), async (ctx) => {
    const { userId, tenantId } = getActor(ctx);
    const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
    const q = ctx.query as Record<string, unknown>;
    const params: Parameters<WorkflowService["listMyTasks"]>[1] = { tenantId, page, pageSize };
    if (q.status !== undefined) params.status = Number(q.status);
    const result = await service.listMyTasks(userId, params);
    return paginated(result.items, result.total, result.page, result.pageSize);
  });

  router.get("/api/workflow/tasks/done", perm("workflow", "task:list"), async (ctx) => {
    const { userId, tenantId } = getActor(ctx);
    const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
    const result = await service.listMyDoneTasks(userId, { page, pageSize, tenantId });
    return paginated(result.items, result.total, result.page, result.pageSize);
  });

  router.post("/api/workflow/tasks/:id/approve", perm("workflow", "task:approve"), async (ctx) => {
    try {
      const id = (ctx.params as Record<string, string>).id!;
      const { userId, tenantId } = getActor(ctx);
      const body = await parseBody(ctx.request);
      await service.approveTask(id, userId, body.comment as string | undefined, tenantId);
      return success(null);
    } catch (e) { return handleError(e); }
  });

  router.post("/api/workflow/tasks/:id/reject", perm("workflow", "task:reject"), async (ctx) => {
    try {
      const id = (ctx.params as Record<string, string>).id!;
      const { userId, tenantId } = getActor(ctx);
      const body = await parseBody(ctx.request);
      await service.rejectTask(id, userId, body.comment as string | undefined, tenantId);
      return success(null);
    } catch (e) { return handleError(e); }
  });

  router.post("/api/workflow/tasks/:id/transfer", perm("workflow", "task:transfer"), async (ctx) => {
    try {
      const id = (ctx.params as Record<string, string>).id!;
      const { userId, tenantId } = getActor(ctx);
      const body = await parseBody(ctx.request);
      await service.transferTask(id, userId, body.targetUserId as string, body.comment as string | undefined, tenantId);
      return success(null);
    } catch (e) { return handleError(e); }
  });

  router.post("/api/workflow/tasks/:id/add-sign", perm("workflow", "task:add-sign"), async (ctx) => {
    try {
      const id = (ctx.params as Record<string, string>).id!;
      const { userId, tenantId } = getActor(ctx);
      const body = await parseBody(ctx.request);
      await service.addSign(id, userId, body.targetUserIds as string[], body.comment as string | undefined, tenantId);
      return success(null);
    } catch (e) { return handleError(e); }
  });

  router.post("/api/workflow/tasks/:id/urge", perm("workflow", "task:urge"), async (ctx) => {
    try {
      const id = (ctx.params as Record<string, string>).id!;
      const { userId, tenantId } = getActor(ctx);
      await service.urgeTask(id, userId, tenantId);
      return success(null);
    } catch (e) { return handleError(e); }
  });

  return router;
}

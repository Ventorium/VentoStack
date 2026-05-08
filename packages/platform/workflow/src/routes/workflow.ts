/**
 * @ventostack/workflow - 工作流路由
 */

import { createRouter } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import type { WorkflowService } from "../services/workflow";
import { ok, okPage, fail, parseBody, pageOf } from "./common";

export function createWorkflowRoutes(
  workflowService: WorkflowService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  // === Definition CRUD ===

  router.post("/api/workflow/definitions", perm("workflow", "definition:create"), async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const result = await workflowService.createDefinition({
        name: body.name as string,
        code: body.code as string,
        description: body.description as string | undefined,
      });
      return ok(result);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "创建失败", 400);
    }
  });

  router.get("/api/workflow/definitions", perm("workflow", "definition:list"), async (ctx) => {
    const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
    const q = ctx.query as Record<string, unknown>;
    const result = await workflowService.listDefinitions({
      status: q.status !== undefined ? Number(q.status) : undefined,
      page,
      pageSize,
    });
    return okPage(result.items, result.total, result.page, result.pageSize);
  });

  router.get("/api/workflow/definitions/:id", perm("workflow", "definition:query"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const def = await workflowService.getDefinition(id);
    if (!def) return fail("流程定义不存在", 404, 404);
    return ok(def);
  });

  router.put("/api/workflow/definitions/:id", perm("workflow", "definition:update"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const body = await parseBody(ctx.request);
    await workflowService.updateDefinition(id, body);
    return ok(null);
  });

  router.delete("/api/workflow/definitions/:id", perm("workflow", "definition:delete"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    await workflowService.deleteDefinition(id);
    return ok(null);
  });

  // === Node management ===

  router.put("/api/workflow/definitions/:id/nodes", perm("workflow", "definition:update"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const body = await parseBody(ctx.request);
    try {
      await workflowService.setNodes(id, body.nodes as any[]);
      return ok(null);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "设置节点失败", 400);
    }
  });

  router.get("/api/workflow/definitions/:id/nodes", perm("workflow", "definition:query"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const nodes = await workflowService.getNodes(id);
    return ok(nodes);
  });

  // === Instance operations ===

  router.post("/api/workflow/instances", perm("workflow", "instance:create"), async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const result = await workflowService.startInstance({
        definitionId: body.definitionId as string,
        initiatorId: (ctx.user as { id: string }).id,
        businessType: body.businessType as string | undefined,
        businessId: body.businessId as string | undefined,
        variables: body.variables as Record<string, unknown> | undefined,
      });
      return ok(result);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "启动流程失败", 400);
    }
  });

  router.get("/api/workflow/instances/:id", perm("workflow", "instance:query"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const detail = await workflowService.getInstanceDetail(id);
    if (!detail) return fail("流程实例不存在", 404, 404);
    return ok(detail);
  });

  // === Task operations ===

  router.get("/api/workflow/tasks", perm("workflow", "task:list"), async (ctx) => {
    const user = ctx.user as { id: string };
    const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
    const q = ctx.query as Record<string, unknown>;
    const result = await workflowService.getMyTasks(user.id, {
      status: q.status !== undefined ? Number(q.status) : undefined,
      page,
      pageSize,
    });
    return okPage(result.items, result.total, result.page, result.pageSize);
  });

  router.put("/api/workflow/tasks/:id/approve", perm("workflow", "task:approve"), async (ctx) => {
    const user = ctx.user as { id: string };
    const id = (ctx.params as Record<string, string>).id!;
    const body = await parseBody(ctx.request);
    try {
      await workflowService.approveTask(id, user.id, body.comment as string | undefined);
      return ok(null);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "审批失败", 400);
    }
  });

  router.put("/api/workflow/tasks/:id/reject", perm("workflow", "task:reject"), async (ctx) => {
    const user = ctx.user as { id: string };
    const id = (ctx.params as Record<string, string>).id!;
    const body = await parseBody(ctx.request);
    try {
      await workflowService.rejectTask(id, user.id, body.comment as string | undefined);
      return ok(null);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "驳回失败", 400);
    }
  });

  return router;
}

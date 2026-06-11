/**
 * 审批路由
 */
import { createRouter } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import { fail, ok, handleError, parseBody } from "./common";

export interface ApprovalCrudService {
  getStatus(id: string): Promise<unknown | null>;
  approve(id: string, reviewedBy: string, reason?: string): Promise<unknown | null>;
  reject(id: string, reviewedBy: string, reason?: string): Promise<unknown | null>;
  listPending(tenantId: string): Promise<unknown[]>;
}

export function createApprovalRoutes(
  approvalService: ApprovalCrudService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  // 获取审批状态
  router.get(
    "/api/ai/approvals/:id",
    perm("ai:approval", "list"),
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const approval = await approvalService.getStatus(id);
      if (!approval) return fail("审批请求不存在", 404, 404);
      return ok(approval);
    },
  );

  // 获取待审批列表
  router.get(
    "/api/ai/approvals",
    perm("ai:approval", "list"),
    async (ctx) => {
      const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "";
      const approvals = await approvalService.listPending(tenantId);
      return ok(approvals);
    },
  );

  // 审批通过
  router.post(
    "/api/ai/approvals/:id/approve",
    perm("ai:approval", "approve"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const userId = (ctx.user as { id?: string })?.id ?? "";
        const body = await parseBody(ctx.request);
        const result = await approvalService.approve(id, userId, body.reason as string | undefined);
        if (!result) return fail("审批请求不存在或已处理", 404, 404);
        return ok(result);
      } catch (e) {
        return handleError(e);
      }
    },
  );

  // 审批拒绝
  router.post(
    "/api/ai/approvals/:id/reject",
    perm("ai:approval", "reject"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const userId = (ctx.user as { id?: string })?.id ?? "";
        const body = await parseBody(ctx.request);
        const result = await approvalService.reject(id, userId, body.reason as string | undefined);
        if (!result) return fail("审批请求不存在或已处理", 404, 404);
        return ok(result);
      } catch (e) {
        return handleError(e);
      }
    },
  );

  return router;
}

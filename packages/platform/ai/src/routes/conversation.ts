/**
 * 对话 CRUD 路由
 */
import { createRouter } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import { fail, ok, okPage, handleError, parseBody, pageOf } from "./common";
import type { ConversationItem } from "../services/conversation";

export interface ConversationCrudService {
  create(params: {
    agentId: string;
    userId: string;
    tenantId: string;
    agentConfig?: Record<string, unknown>;
    title?: string;
  }): Promise<{ id: string }>;
  getById(id: string, userId: string): Promise<ConversationItem | null>;
  list(params: {
    userId: string;
    agentId?: string;
    tenantId: string;
  }): Promise<ConversationItem[]>;
  delete(id: string, userId: string): Promise<void>;
}

export function createConversationRoutes(
  conversationService: ConversationCrudService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  // 创建对话
  router.post(
    "/api/ai/conversations",
    perm("ai:conversation", "create"),
    async (ctx) => {
      try {
        const body = await parseBody(ctx.request);
        const userId = (ctx.user as { id?: string })?.id ?? "";
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "";
        const result = await conversationService.create({
          agentId: body.agentId as string,
          userId,
          tenantId,
          title: body.title as string | undefined,
        });
        return ok(result);
      } catch (e) {
        return handleError(e);
      }
    },
  );

  // 获取对话详情
  router.get(
    "/api/ai/conversations/:id",
    perm("ai:conversation", "list"),
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const userId = (ctx.user as { id?: string })?.id ?? "";
      const conversation = await conversationService.getById(id, userId);
      if (!conversation) return fail("对话不存在", 404, 404);
      return ok(conversation);
    },
  );

  // 获取对话列表
  router.get(
    "/api/ai/conversations",
    perm("ai:conversation", "list"),
    async (ctx) => {
      const userId = (ctx.user as { id?: string })?.id ?? "";
      const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "";
      const q = ctx.query as Record<string, unknown>;
      const conversations = await conversationService.list({
        userId,
        agentId: q.agentId as string | undefined,
        tenantId,
      });
      return ok(conversations);
    },
  );

  // 删除对话
  router.delete(
    "/api/ai/conversations/:id",
    perm("ai:conversation", "delete"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const userId = (ctx.user as { id?: string })?.id ?? "";
        await conversationService.delete(id, userId);
        return ok(null);
      } catch (e) {
        return handleError(e);
      }
    },
  );

  return router;
}

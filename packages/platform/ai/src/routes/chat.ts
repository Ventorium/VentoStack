/**
 * 对话路由（含 SSE 流式）
 */
import { createRouter } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import type { AgentLoop } from "../agent-engine/types";
import { createSSEResponse } from "../stream-engine/sse";
import { fail, ok, handleError, parseBody } from "./common";

export interface ConversationService {
  create(params: {
    agentId: string;
    userId: string;
    tenantId: string;
  }): Promise<{ id: string }>;
  getById(id: string, userId: string): Promise<unknown | null>;
  list(params: {
    userId: string;
    agentId?: string;
    tenantId: string;
  }): Promise<unknown[]>;
  delete(id: string, userId: string): Promise<void>;
}

export function createChatRoutes(
  agentLoop: AgentLoop,
  conversationService: ConversationService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  // 创建会话
  router.post(
    "/api/ai/conversations",
    perm("ai:chat", "use"),
    async (ctx) => {
      try {
        const body = await parseBody(ctx.request);
        const userId = (ctx.user as { id?: string })?.id ?? "";
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "";
        const result = await conversationService.create({
          agentId: body.agentId as string,
          userId,
          tenantId,
        });
        return ok(result);
      } catch (e) {
        return handleError(e);
      }
    },
  );

  // 获取会话列表
  router.get(
    "/api/ai/conversations",
    perm("ai:chat", "use"),
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

  // 删除会话
  router.delete(
    "/api/ai/conversations/:id",
    perm("ai:chat", "use"),
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

  // 发送消息（非流式）
  router.post(
    "/api/ai/chat",
    perm("ai:chat", "use"),
    async (ctx) => {
      try {
        const body = await parseBody(ctx.request);
        const userId = (ctx.user as { id?: string })?.id ?? "";
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "";

        const stream = agentLoop.runStream({
          agentId: body.agentId as string,
          userId,
          sessionId: body.sessionId as string | undefined,
          message: body.message as string,
          tenantId,
        });

        // 收集流式结果
        let content = "";
        for await (const chunk of stream) {
          if (chunk.type === "content") {
            content += chunk.delta ?? "";
          }
        }

        return ok({ content, sessionId: body.sessionId });
      } catch (e) {
        return handleError(e);
      }
    },
  );

  // 发送消息（SSE 流式）
  router.post(
    "/api/ai/chat/stream",
    perm("ai:chat", "use"),
    async (ctx) => {
      try {
        const body = await parseBody(ctx.request);
        const userId = (ctx.user as { id?: string })?.id ?? "";
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "";

        // 如果没有 sessionId，创建新会话
        let sessionId = body.sessionId as string | undefined;
        if (!sessionId) {
          const conv = await conversationService.create({
            agentId: body.agentId as string,
            userId,
            tenantId,
          });
          sessionId = conv.id;
        }

        const stream = agentLoop.runStream({
          agentId: body.agentId as string,
          userId,
          sessionId,
          message: body.message as string,
          tenantId,
          signal: ctx.request.signal,
        });

        return createSSEResponse(stream, {
          signal: ctx.request.signal,
        });
      } catch (e) {
        return handleError(e);
      }
    },
  );

  return router;
}

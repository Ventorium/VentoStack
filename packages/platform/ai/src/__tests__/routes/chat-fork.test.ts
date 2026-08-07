import { describe, expect, test } from "bun:test";
import { createChatRoutes } from "../../routes/chat";
import type { AgentLoop } from "../../agent-engine/agent-loop";
import type { MemoryService } from "../../memory/types";
import type { Router } from "@ventostack/core";

const noopAgentLoop = {} as unknown as AgentLoop;
const noopConversationService = {
  async create() {
    return { id: "x" };
  },
  async getById() {
    return null;
  },
  async list() {
    return [];
  },
  async delete() {},
};

const passMiddleware = async (_ctx: unknown, next: () => Promise<Response>) => next();

function buildRouter(memory: MemoryService): Router {
  return createChatRoutes(
    noopAgentLoop,
    noopConversationService,
    passMiddleware as never,
    () => passMiddleware as never,
    memory,
  );
}

describe("会话 fork 路由", () => {
  test("注册了 POST /api/ai/conversations/:id/fork", () => {
    const memory = {
      forkSession: async () => ({ sessionId: "x" }),
    } as unknown as MemoryService;
    const router = buildRouter(memory);
    const routes = router.routes();
    const fork = routes.find((r) => r.method === "POST" && r.path === "/api/ai/conversations/:id/fork");
    expect(fork).toBeDefined();
  });

  test("调用 memory.forkSession 并返回新会话 id", async () => {
    const calls: unknown[] = [];
    const memory = {
      async forkSession(sessionId: string, scope: unknown, destination: unknown) {
        calls.push({ sessionId, scope, destination });
        return { sessionId: "forked-1" };
      },
    } as unknown as MemoryService;
    const router = buildRouter(memory);
    const fork = router.routes().find((r) => r.method === "POST" && r.path === "/api/ai/conversations/:id/fork")!;

    const ctx = {
      request: new Request("http://test/api/ai/conversations/src-1/fork", {
        method: "POST",
        body: JSON.stringify({ position: "before" }),
      }),
      params: { id: "src-1" },
      user: { id: "user-1", tenantId: "tenant-1" },
    } as never;

    const result = (await fork.handler(ctx)) as Response;
    expect(result.status).toBe(200);
    const body = (await result.json()) as { code: number; data: { sessionId: string } };
    expect(body.code).toBe(0);
    expect(body.data.sessionId).toBe("forked-1");
    // 处理器传入的 destination：新 sessionId 由处理器生成，options 透传请求体
    const call = calls[0] as { sessionId: string; scope: { tenantId: string; userId: string }; destination: { sessionId: string; options: { position: string } } };
    expect(call.sessionId).toBe("src-1");
    expect(call.scope).toEqual({ tenantId: "tenant-1", userId: "user-1" });
    expect(typeof call.destination.sessionId).toBe("string");
    expect(call.destination.options).toEqual({ position: "before" });
  });
});

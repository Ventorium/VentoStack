import { describe, expect, test } from 'bun:test';
import type { Router } from '@ventostack/core';
import type { AgentLoop } from '../../agent-engine/agent-loop';
import type { MemoryService } from '../../memory/types';
import { createChatRoutes } from '../../routes/chat';

const passMiddleware = async (_ctx: unknown, next: () => Promise<Response>) => next();

function buildRouter(agentLoop: unknown): Router {
  return createChatRoutes(
    agentLoop as AgentLoop,
    {
      async create() {
        return { id: 'conv-1' };
      },
      async getById() {
        return null;
      },
      async list() {
        return [];
      },
      async delete() {},
      async getMessages() {
        return [];
      },
    },
    passMiddleware as never,
    () => passMiddleware as never,
    {} as unknown as MemoryService,
  );
}

function findHandler(router: Router, method: string, path: string) {
  const route = router.routes().find((r) => r.method === method && r.path === path);
  if (!route) throw new Error(`${method} ${path} route not found`);
  return route.handler;
}

async function callStop(
  router: Router,
  sessionId: string,
  user: { id: string; tenantId: string },
): Promise<Response> {
  const handler = findHandler(router, 'POST', '/api/ai/chat/sessions/:id/stop');
  return (await handler({
    request: new Request(`http://test/api/ai/chat/sessions/${sessionId}/stop`, { method: 'POST' }),
    params: { id: sessionId },
    user,
  } as never)) as Response;
}

/** 启动一次流式运行：runStream 挂起直到 signal abort（模拟等待审批中被停止） */
function startRun(router: Router) {
  const state = { started: false, aborted: false };
  const handler = findHandler(router, 'POST', '/api/ai/chat/stream');
  const responsePromise = handler({
    request: new Request('http://test/api/ai/chat/stream', {
      method: 'POST',
      body: JSON.stringify({ agentId: 'agent-1', sessionId: 'conv-1', message: 'hi' }),
    }),
    params: {},
    user: { id: 'user-1', tenantId: 'tenant-1' },
  } as never) as Promise<Response>;
  return { state, responsePromise };
}

function createSuspendingLoop(state: { started: boolean; aborted: boolean }) {
  return {
    async *runStream(params: { signal?: AbortSignal }) {
      state.started = true;
      await new Promise<void>((resolve) => {
        if (params.signal?.aborted) {
          resolve();
          return;
        }
        params.signal?.addEventListener('abort', () => resolve(), { once: true });
      });
      state.aborted = true;
    },
  };
}

describe('停止会话运行（POST /api/ai/chat/sessions/:id/stop）', () => {
  test('同用户同租户可中断运行', async () => {
    const state = { started: false, aborted: false };
    const router = buildRouter(createSuspendingLoop(state));
    const { responsePromise } = startRun(router);
    const response = await responsePromise;
    // 触发 ReadableStream start()：运行注册在 handler 内已完成，读流保证 generator 真正启动
    const reader = response.body!.getReader();
    const readPromise = reader.read();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(state.started).toBe(true);

    const stopRes = await callStop(router, 'conv-1', { id: 'user-1', tenantId: 'tenant-1' });
    expect(stopRes.status).toBe(200);
    expect((await stopRes.json()) as { data?: { stopped?: boolean } }).toMatchObject({
      data: { stopped: true },
    });

    await readPromise;
    await reader.cancel().catch(() => {});
    expect(state.aborted).toBe(true);
  });

  test('无进行中的运行返回 404', async () => {
    const router = buildRouter(createSuspendingLoop({ started: false, aborted: false }));
    const res = await callStop(router, 'conv-none', { id: 'user-1', tenantId: 'tenant-1' });
    expect(res.status).toBe(404);
  });

  test('跨用户/跨租户按不存在处理（不泄露他人会话运行）', async () => {
    const state = { started: false, aborted: false };
    const router = buildRouter(createSuspendingLoop(state));
    const { responsePromise } = startRun(router);
    const response = await responsePromise;
    const reader = response.body!.getReader();
    const readPromise = reader.read();
    await new Promise((resolve) => setTimeout(resolve, 10));

    const otherUser = await callStop(router, 'conv-1', { id: 'user-2', tenantId: 'tenant-1' });
    expect(otherUser.status).toBe(404);
    const otherTenant = await callStop(router, 'conv-1', { id: 'user-1', tenantId: 'tenant-2' });
    expect(otherTenant.status).toBe(404);

    // 未被误中断：同租户本人仍能停止
    const own = await callStop(router, 'conv-1', { id: 'user-1', tenantId: 'tenant-1' });
    expect(own.status).toBe(200);
    await readPromise;
    await reader.cancel().catch(() => {});
  });
});

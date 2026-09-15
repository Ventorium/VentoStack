import { describe, expect, test } from 'bun:test';
import { createChatRoutes } from '../../routes/chat';
import type { AgentLoop } from '../../agent-engine/agent-loop';
import type { MemoryService } from '../../memory/types';
import type { Router } from '@ventostack/core';

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

function streamHandler(router: Router) {
  const route = router
    .routes()
    .find((r) => r.method === 'POST' && r.path === '/api/ai/chat/stream');
  if (!route) throw new Error('stream route not found');
  return route.handler;
}

async function callStream(body: Record<string, unknown>): Promise<Response> {
  const router = buildRouter({
    // 运行模式校验通过后才会走到这里；返回空流即可
    async *runStream() {},
  });
  const handler = streamHandler(router);
  return (await handler({
    request: new Request('http://test/api/ai/chat/stream', {
      method: 'POST',
      body: JSON.stringify({ agentId: 'agent-1', sessionId: 'conv-1', message: 'hi', ...body }),
    }),
    params: {},
    user: { id: 'user-1', tenantId: 'tenant-1' },
  } as never)) as Response;
}

describe('运行模式（runMode）路由校验', () => {
  test('非法 runMode 返回 400 且消息可读', async () => {
    const res = await callStream({ runMode: 'yolo' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain('runMode');
  });

  test('非字符串 runMode 同样拒绝', async () => {
    const res = await callStream({ runMode: 1 });
    expect(res.status).toBe(400);
  });

  test('三种合法取值均通过校验', async () => {
    for (const runMode of ['ask', 'auto', 'trust']) {
      const res = await callStream({ runMode });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
    }
  });

  test('缺省 runMode 通过校验（后端按 ask 处理）', async () => {
    const res = await callStream({});
    expect(res.status).toBe(200);
  });
});

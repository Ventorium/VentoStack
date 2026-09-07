import { describe, expect, test } from 'bun:test';
import { createRouter } from '@ventostack/core';
import { createOpenAPIGenerator, syncRouterToOpenAPI } from '@ventostack/openapi';
import type { AgentLoop } from '../../agent-engine/agent-loop';
import type { MemoryService } from '../../memory/types';
import { createAgentRoutes } from '../../routes/agent';
import { createChatRoutes } from '../../routes/chat';

const passMiddleware = async (_ctx: unknown, next: () => Promise<Response>) => next();
const noopAgentLoop = {} as unknown as AgentLoop;
const noopConversationService = {
  async create() {
    return { id: 'x' };
  },
  async getById() {
    return null;
  },
  async list() {
    return [];
  },
  async delete() {},
};

function buildAIRouter() {
  const router = createRouter();
  router.merge(
    createAgentRoutes(
      {
        async create() {
          return { id: 'x' };
        },
        async getById() {
          return null;
        },
        async list() {
          return { list: [], total: 0 };
        },
        async update() {},
        async delete() {},
        async publish() {},
      },
      passMiddleware as never,
      () => passMiddleware as never,
    ),
  );
  router.merge(
    createChatRoutes(
      noopAgentLoop,
      noopConversationService,
      passMiddleware as never,
      () => passMiddleware as never,
      {} as MemoryService,
    ),
  );
  return router;
}

describe('AI 路由 OpenAPI 契约', () => {
  test('syncRouterToOpenAPI 收录 /api/ai 路由并携带 schema', () => {
    const router = buildAIRouter();
    const generator = createOpenAPIGenerator();
    generator.setInfo({ title: 'AI API', version: '1.0.0' });
    syncRouterToOpenAPI(router, generator);
    const doc = generator.generate();
    const paths = doc.paths as Record<string, Record<string, unknown>>;

    // Agent CRUD
    expect(paths['/api/ai/agents']?.post).toBeDefined();
    const createOp = paths['/api/ai/agents']?.post as {
      summary?: string;
      requestBody?: { content?: Record<string, { schema?: Record<string, unknown> }> };
    };
    expect(createOp.summary).toBe('创建 Agent');
    expect(createOp.requestBody?.content?.['application/json']?.schema).toBeDefined();

    // 列表查询参数
    const listOp = paths['/api/ai/agents']?.get as { parameters?: Array<{ name: string }> };
    expect(listOp.parameters?.some((p) => p.name === 'page')).toBe(true);

    // 聊天流式
    expect(paths['/api/ai/chat/stream']?.post).toBeDefined();
    const streamOp = paths['/api/ai/chat/stream']?.post as { summary?: string };
    expect(streamOp.summary).toBe('发送消息（SSE 流式）');

    // 聊天内确认
    expect(paths['/api/ai/chat/approvals/:id/confirm']?.post).toBeDefined();
    expect(paths['/api/ai/agents/:id/publish']?.post).toBeDefined();
    const createSchema = createOp.requestBody?.content?.['application/json']?.schema as {
      properties?: Record<string, unknown>;
    };
    expect(createSchema.properties?.requiresVirtualEnvironment).toMatchObject({
      type: 'boolean',
    });
    expect(paths['/api/ai/conversations/:id/fork']?.post).toBeDefined();
  });
});

/**
 * 对话路由（含 SSE 流式）
 */
import { createRouter, fail, handleError, parseBody, success } from '@ventostack/core';
import type { Middleware, Router } from '@ventostack/core';
import type { AgentLoop } from '../agent-engine/agent-loop';
import type { MemoryService } from '../memory/types';
import { createSSEResponse } from '../stream-engine/sse';
import type { ToolRegistry } from '../tool-registry';
import { routeDoc } from './schema';

export interface ConversationService {
  create(params: {
    agentId: string;
    userId: string;
    tenantId: string;
  }): Promise<{ id: string }>;
  getById(id: string, userId: string, tenantId: string): Promise<unknown | null>;
  list(params: {
    userId: string;
    agentId?: string;
    tenantId: string;
  }): Promise<unknown[]>;
  delete(id: string, userId: string, tenantId: string): Promise<void>;
  /** 获取会话历史消息（供前端切换会话时回显） */
  getMessages(
    id: string,
    userId: string,
    tenantId: string,
    limit?: number,
  ): Promise<Array<{ role: string; content: string }>>;
}

export function createChatRoutes(
  agentLoop: AgentLoop,
  conversationService: ConversationService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
  memoryService?: MemoryService,
  options?: {
    /** 按请求 tenantId 构建请求级工具注册表（KB 等租户相关工具绑定请求租户） */
    createTenantToolRegistry?: (tenantId: string) => ToolRegistry;
  },
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  /** 请求级工具注册表：有租户标识且配置了工厂时构建，否则使用 agentLoop 的默认注册表 */
  function buildRequestToolRegistry(ctx: { user?: unknown }): ToolRegistry | undefined {
    const tenantId = (ctx.user as { tenantId?: string } | undefined)?.tenantId ?? '';
    if (!tenantId || !options?.createTenantToolRegistry) return undefined;
    return options.createTenantToolRegistry(tenantId);
  }

  // 创建会话
  router.post(
    '/api/ai/conversations',
    routeDoc('创建会话', {
      body: {
        agentId: { type: 'string', required: true, description: 'Agent ID' },
      },
      responses: { 200: { id: { type: 'string', description: '会话 ID' } } },
    }),
    async (ctx) => {
      try {
        const body = await parseBody(ctx.request);
        const userId = (ctx.user as { id?: string })?.id ?? '';
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? '';
        const result = await conversationService.create({
          agentId: body.agentId as string,
          userId,
          tenantId,
        });
        return success(result);
      } catch (e) {
        return handleError(e);
      }
    },
    perm('ai:chat', 'use'),
  );

  // 获取会话列表
  router.get(
    '/api/ai/conversations',
    routeDoc('获取会话列表', {
      query: {
        agentId: { type: 'string', description: '按 Agent 过滤' },
      },
    }),
    async (ctx) => {
      const userId = (ctx.user as { id?: string })?.id ?? '';
      const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? '';
      const q = ctx.query as Record<string, unknown>;
      const conversations = await conversationService.list({
        userId,
        agentId: q.agentId as string | undefined,
        tenantId,
      });
      return success(conversations);
    },
    perm('ai:chat', 'use'),
  );

  // 删除会话
  router.delete(
    '/api/ai/conversations/:id',
    routeDoc('删除会话'),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const userId = (ctx.user as { id?: string })?.id ?? '';
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? '';
        await conversationService.delete(id, userId, tenantId);
        return success(null);
      } catch (e) {
        return handleError(e);
      }
    },
    perm('ai:chat', 'use'),
  );

  // 获取会话历史消息（切换会话时回显）
  router.get(
    '/api/ai/conversations/:id/messages',
    routeDoc('获取会话历史消息', {
      query: {
        limit: { type: 'int', description: '最大消息数（默认 50）' },
      },
    }),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const userId = (ctx.user as { id?: string })?.id ?? '';
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? '';
        // limit 上限保护：防止一次性拉取超大历史导致内存/IO 压力
        const rawLimit = Number((ctx.query as Record<string, unknown>)?.limit ?? 50);
        const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, Math.floor(rawLimit)), 200) : 50;
        const messages = await conversationService.getMessages(id, userId, tenantId, limit);
        return success(messages);
      } catch (e) {
        return handleError(e);
      }
    },
    perm('ai:chat', 'use'),
  );

  // 分叉会话：从历史消息开启新的独立对话分支
  router.post(
    '/api/ai/conversations/:id/fork',
    routeDoc('分叉会话', {
      body: {
        entryId: { type: 'string', description: '分叉入口消息 ID' },
        position: { type: 'string', enum: ['before', 'at'], description: '分叉位置' },
        scope: { type: 'string', enum: ['tree', 'branch'], description: '分叉范围' },
      },
      responses: { 200: { sessionId: { type: 'string', description: '新会话 ID' } } },
    }),
    async (ctx) => {
      try {
        if (!memoryService) throw new Error('Memory service is not configured');
        const id = (ctx.params as Record<string, string>).id!;
        const userId = (ctx.user as { id?: string })?.id ?? '';
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? '';
        const body = await parseBody(ctx.request);
        const { sessionId } = await memoryService.forkSession(
          id,
          { tenantId, userId },
          {
            sessionId: crypto.randomUUID(),
            options: {
              ...(body.entryId === undefined ? {} : { entryId: body.entryId as string }),
              ...(body.position === undefined
                ? {}
                : { position: body.position as 'before' | 'at' }),
              ...(body.scope === undefined ? {} : { scope: body.scope as 'tree' | 'branch' }),
            },
          },
        );
        return success({ sessionId });
      } catch (e) {
        return handleError(e);
      }
    },
    perm('ai:chat', 'use'),
  );

  // 发送消息（非流式）
  router.post(
    '/api/ai/chat',
    routeDoc('发送消息（非流式）', {
      body: {
        agentId: { type: 'string', required: true, description: 'Agent ID' },
        sessionId: { type: 'string', description: '会话 ID（缺省自动创建）' },
        message: { type: 'string', required: true, description: '用户消息' },
        tools: { type: 'array', items: { type: 'string' }, description: '工具过滤' },
        skillIds: { type: 'array', items: { type: 'string' }, description: '技能过滤' },
        mcpServerIds: { type: 'array', items: { type: 'string' }, description: 'MCP 过滤' },
        knowledgeBaseIds: { type: 'array', items: { type: 'string' }, description: '知识库过滤' },
      },
      responses: {
        200: {
          content: { type: 'string', description: '回复内容' },
          sessionId: { type: 'string', description: '会话 ID' },
        },
      },
    }),
    async (ctx) => {
      try {
        const body = await parseBody(ctx.request);
        const userId = (ctx.user as { id?: string })?.id ?? '';
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? '';
        const toolRegistry = buildRequestToolRegistry(ctx);

        // 输入校验：message 必填 + 长度上限（防超大输入拖垮 LLM 与内存）
        const rawMessage = body.message as string | undefined;
        if (!rawMessage || typeof rawMessage !== 'string') {
          return fail('message 字段必填', 400, 400);
        }
        if (rawMessage.length > 200_000) {
          return fail('message 长度超出上限（200000 字符）', 400, 400);
        }

        // 缺省会话时先创建会话，保证 runStream 能按 sessionId 持久化消息并返回真实会话 ID
        let returnedSessionId = body.sessionId as string | undefined;
        if (!returnedSessionId) {
          const conv = await conversationService.create({
            agentId: body.agentId as string,
            userId,
            tenantId,
          });
          returnedSessionId = conv.id;
        }

        const stream = agentLoop.runStream({
          agentId: body.agentId as string,
          userId,
          sessionId: returnedSessionId,
          message: rawMessage,
          tenantId,
          toolRegistry,
          // 能力过滤器
          tools: body.tools as string[] | undefined,
          skillIds: body.skillIds as string[] | undefined,
          mcpServerIds: body.mcpServerIds as string[] | undefined,
          knowledgeBaseIds: body.knowledgeBaseIds as string[] | undefined,
        });

        // 收集流式结果
        let content = '';
        for await (const chunk of stream) {
          if (chunk.type === 'content') {
            content += chunk.delta ?? '';
          }
        }

        return success({ content, sessionId: returnedSessionId });
      } catch (e) {
        return handleError(e);
      }
    },
    perm('ai:chat', 'use'),
  );

  // 发送消息（SSE 流式）
  router.post(
    '/api/ai/chat/stream',
    routeDoc('发送消息（SSE 流式）', {
      body: {
        agentId: { type: 'string', required: true, description: 'Agent ID' },
        sessionId: { type: 'string', description: '会话 ID（缺省自动创建）' },
        message: { type: 'string', required: true, description: '用户消息' },
        tools: { type: 'array', items: { type: 'string' }, description: '工具过滤' },
        skillIds: { type: 'array', items: { type: 'string' }, description: '技能过滤' },
        mcpServerIds: { type: 'array', items: { type: 'string' }, description: 'MCP 过滤' },
        knowledgeBaseIds: { type: 'array', items: { type: 'string' }, description: '知识库过滤' },
      },
      responses: {
        200: {
          description:
            'SSE 流（content / tool_call_start / stage / sources / usage / error / done）',
        },
      },
    }),
    async (ctx) => {
      try {
        const body = await parseBody(ctx.request);
        const userId = (ctx.user as { id?: string })?.id ?? '';
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? '';
        const toolRegistry = buildRequestToolRegistry(ctx);

        // 输入校验：message 必填 + 长度上限（与 /api/ai/chat 保持一致）
        const rawMessage = body.message as string | undefined;
        if (!rawMessage || typeof rawMessage !== 'string') {
          return fail('message 字段必填', 400, 400);
        }
        if (rawMessage.length > 200_000) {
          return fail('message 长度超出上限（200000 字符）', 400, 400);
        }

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
          message: rawMessage,
          tenantId,
          signal: ctx.request.signal,
          toolRegistry,
          // 能力过滤器
          tools: body.tools as string[] | undefined,
          skillIds: body.skillIds as string[] | undefined,
          mcpServerIds: body.mcpServerIds as string[] | undefined,
          knowledgeBaseIds: body.knowledgeBaseIds as string[] | undefined,
        });

        // 在流开头下发 session 事件，前端据此绑定会话 ID（新建会话时前端无 sessionId）
        const streamWithSession = (async function* () {
          yield { type: 'session' as const, sessionId } as const;
          yield* stream;
        })();

        return createSSEResponse(streamWithSession, {
          signal: ctx.request.signal,
        });
      } catch (e) {
        return handleError(e);
      }
    },
    perm('ai:chat', 'use'),
  );

  return router;
}

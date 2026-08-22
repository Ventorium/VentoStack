import { existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
/**
 * Agent 路由
 */
import {
  createRouter,
  fail,
  handleError,
  pageOf,
  paginated,
  parseBody,
  success,
} from '@ventostack/core';
import type { Middleware, Router } from '@ventostack/core';
import { paginationQuery, routeDoc } from './schema';

export interface AgentCrudService {
  create(params: Record<string, unknown>): Promise<{ id: string }>;
  getById(id: string, tenantId: string): Promise<unknown | null>;
  list(params: {
    tenantId: string;
    userId: string;
    isAdmin: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<{ list: unknown[]; total: number }>;
  update(id: string, params: Record<string, unknown>, tenantId: string, opts?: { userId?: string; isAdmin?: boolean }): Promise<void>;
  delete(id: string, tenantId: string, opts?: { userId?: string; isAdmin?: boolean }): Promise<void>;
  publish(id: string, tenantId: string, opts?: { userId?: string; isAdmin?: boolean }): Promise<void>;
}

/** 从 ctx.user 提取当前用户信息（id + 是否超管） */
function currentUser(ctx: { user?: { id?: string; roles?: string[] } }): { userId: string; isAdmin: boolean } {
  const user = ctx.user;
  return {
    userId: user?.id ?? '',
    isAdmin: (user?.roles ?? []).includes('admin'),
  };
}

/** Agent 路由请求体字段白名单（status 不在其中：只能通过 publish 接口变更） */
const AGENT_BODY_FIELDS = [
  'name', 'description', 'model', 'systemPrompt', 'tools',
  'knowledgeBaseIds', 'skillIds', 'mcpServerIds',
  'modelOverrides', 'memoryConfig', 'config',
  'maxIterations', 'maxTokensPerTurn', 'isPublic',
] as const;

/** 迭代轮数 / 单轮 Token / 能力清单长度的硬上限（防止单条消息放大成天文数字的 LLM 成本） */
const MAX_ITERATIONS_LIMIT = 50;
const MAX_TOKENS_PER_TURN_LIMIT = 100_000;
const MAX_LIST_LENGTH = 20;

/** 校验 Agent 请求体的数值上限与数组规模；返回错误信息或 null */
function validateAgentBody(body: Record<string, unknown>): string | null {
  if (body.maxIterations !== undefined) {
    const v = Number(body.maxIterations);
    if (!Number.isInteger(v) || v < 1 || v > MAX_ITERATIONS_LIMIT) {
      return `maxIterations 必须是 1-${MAX_ITERATIONS_LIMIT} 之间的整数`;
    }
  }
  if (body.maxTokensPerTurn !== undefined) {
    const v = Number(body.maxTokensPerTurn);
    if (!Number.isInteger(v) || v < 1 || v > MAX_TOKENS_PER_TURN_LIMIT) {
      return `maxTokensPerTurn 必须是 1-${MAX_TOKENS_PER_TURN_LIMIT} 之间的整数`;
    }
  }
  for (const field of ['tools', 'knowledgeBaseIds', 'skillIds', 'mcpServerIds'] as const) {
    const list = body[field];
    if (list !== undefined && (!Array.isArray(list) || list.length > MAX_LIST_LENGTH)) {
      return `${field} 必须是数组且最多 ${MAX_LIST_LENGTH} 项`;
    }
  }
  return null;
}

/** 按白名单拷贝请求体字段（丢弃 status 等未声明字段） */
function pickAgentFields(body: Record<string, unknown>): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const field of AGENT_BODY_FIELDS) {
    if (body[field] !== undefined) params[field] = body[field];
  }
  return params;
}

export function createAgentRoutes(
  agentService: AgentCrudService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
  deps?: { storagePath?: string },
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  router.post(
    '/api/ai/agents',
    routeDoc('创建 Agent', {
      body: {
        name: { type: 'string', required: true, max: 128, description: 'Agent 名称' },
        description: { type: 'string', description: '描述' },
        model: { type: 'string', required: true, description: '模型 ID' },
        systemPrompt: { type: 'string', required: true, description: '系统提示词' },
        tools: { type: 'array', items: { type: 'string' }, description: '启用的工具名' },
        knowledgeBaseIds: {
          type: 'array',
          items: { type: 'string' },
          description: '绑定的知识库 ID',
        },
        skillIds: { type: 'array', items: { type: 'string' }, description: '绑定的技能 ID' },
        mcpServerIds: {
          type: 'array',
          items: { type: 'string' },
          description: '绑定的 MCP 服务 ID',
        },
        modelOverrides: {
          type: 'object',
          description: '模型覆盖配置（能力 → 模型 ID 映射）',
        },
        memoryConfig: {
          type: 'object',
          description: '记忆配置（enabled/longTerm/maxHistoryMessages）',
        },
        config: { type: 'object', description: '扩展配置（如 research.depth）' },
        maxIterations: { type: 'int', description: '最大迭代轮数' },
        maxTokensPerTurn: { type: 'int', description: '每轮 Token 上限' },
        isPublic: { type: 'bool', description: '是否公开' },
      },
      responses: { 200: { id: { type: 'string', description: 'Agent ID' } } },
    }),
    async (ctx) => {
      try {
        const body = await parseBody(ctx.request);
        const userId = (ctx.user as { id?: string })?.id ?? '';
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? '';
        // 字段白名单 + 数值上限校验：status 不在白名单内，只能通过 publish 接口变更
        const validationError = validateAgentBody(body);
        if (validationError) return fail(validationError, 400, 400);
        const params = pickAgentFields(body);
        const result = await agentService.create({
          ...params,
          tenantId,
          createdBy: userId,
        });
        return success(result);
      } catch (e) {
        return handleError(e);
      }
    },
    perm('ai:agent', 'create'),
  );

  router.get(
    '/api/ai/agents',
    routeDoc('获取 Agent 列表', {
      query: {
        ...paginationQuery,
        status: { type: 'string', description: '按状态过滤（published / draft）' },
        search: { type: 'string', description: '按名称或描述模糊搜索' },
      },
    }),
    async (ctx) => {
      const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
      const userId = (ctx.user as { id?: string })?.id ?? '';
      const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? '';
      const roles = (ctx.user as { roles?: string[] })?.roles ?? [];
      const isAdmin = roles.includes('admin');
      const q = ctx.query as Record<string, unknown>;
      const result = await agentService.list({
        tenantId,
        userId,
        isAdmin,
        page,
        pageSize,
        status: q.status as string | undefined,
        search: q.search as string | undefined,
      });
      return paginated(result.list, result.total, page, pageSize);
    },
    perm('ai:agent', 'list'),
  );

  router.get(
    '/api/ai/agents/:id',
    routeDoc('获取 Agent 详情'),
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? '';
      const agent = await agentService.getById(id, tenantId);
      if (!agent) return fail('Agent 不存在', 404, 404);
      return success(agent);
    },
    perm('ai:agent', 'list'),
  );

  // 更新 Agent
  router.put(
    '/api/ai/agents/:id',
    routeDoc('更新 Agent', {
      body: {
        name: { type: 'string', max: 128, description: 'Agent 名称' },
        description: { type: 'string', description: '描述' },
        model: { type: 'string', description: '模型 ID' },
        systemPrompt: { type: 'string', description: '系统提示词' },
        tools: { type: 'array', items: { type: 'string' }, description: '启用的工具名' },
        knowledgeBaseIds: {
          type: 'array',
          items: { type: 'string' },
          description: '绑定的知识库 ID',
        },
        skillIds: { type: 'array', items: { type: 'string' }, description: '绑定的技能 ID' },
        mcpServerIds: {
          type: 'array',
          items: { type: 'string' },
          description: '绑定的 MCP 服务 ID',
        },
        modelOverrides: {
          type: 'object',
          description: '模型覆盖配置（能力 → 模型 ID 映射）',
        },
        memoryConfig: { type: 'object', description: '记忆配置' },
        config: { type: 'object', description: '扩展配置（如 research.depth）' },
        maxIterations: { type: 'int', description: '最大迭代轮数' },
        maxTokensPerTurn: { type: 'int', description: '每轮 Token 上限' },
        isPublic: { type: 'bool', description: '是否公开' },
      },
    }),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? '';
        const body = await parseBody(ctx.request);
        // status 只能通过 publish 接口变更，防止普通 update 直接绕过发布校验
        const { status: _ignored, ...rest } = body;
        const validationError = validateAgentBody(rest);
        if (validationError) return fail(validationError, 400, 400);
        await agentService.update(id, pickAgentFields(rest), tenantId, currentUser(ctx));
        return success(null);
      } catch (e) {
        return handleError(e);
      }
    },
    perm('ai:agent', 'update'),
  );

  router.delete(
    '/api/ai/agents/:id',
    routeDoc('删除 Agent'),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? '';
        await agentService.delete(id, tenantId, currentUser(ctx));
        return success(null);
      } catch (e) {
        return handleError(e);
      }
    },
    perm('ai:agent', 'delete'),
  );

  router.post(
    '/api/ai/agents/:id/publish',
    routeDoc('发布 Agent'),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? '';
        await agentService.publish(id, tenantId, currentUser(ctx));
        return success(null);
      } catch (e) {
        return handleError(e);
      }
    },
    perm('ai:agent', 'publish'),
  );

  // ── 工作区文件浏览 ──
  const WORKSPACE_BASE = deps?.storagePath ?? './data/skills/.workspace';

  // 列出工作区文件（独立细粒度权限：读取 Agent 工作区原始文件不应随列表权限放开）
  router.get('/api/ai/agents/:id/workspace/files', perm('ai:agent', 'workspace'), async (ctx) => {
    try {
      const id = (ctx.params as Record<string, string>).id!;
      const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? '';
      // 归属校验：agent 必须存在且属于当前租户
      const agent = await agentService.getById(id, tenantId);
      if (!agent) return fail('Agent 不存在', 404, 404);

      const workspaceBase = resolve(WORKSPACE_BASE);
      const workspaceDir = resolve(join(workspaceBase, id));
      if (workspaceDir !== workspaceBase && !workspaceDir.startsWith(workspaceBase + sep)) {
        return fail('路径不合法', 400, 400);
      }
      if (!existsSync(workspaceDir)) return success([]);

      const files: Array<{ path: string; size: number; modifiedAt: string }> = [];
      async function walk(dir: string, rel: string) {
        const items = await readdir(dir, { withFileTypes: true }).catch(() => []);
        for (const item of items) {
          const itemRel = rel ? `${rel}/${item.name}` : item.name;
          const fullPath = join(dir, item.name);
          if (item.isDirectory()) {
            await walk(fullPath, itemRel);
          } else {
            const s = await stat(fullPath).catch(() => null);
            files.push({
              path: itemRel,
              size: s?.size ?? 0,
              modifiedAt: s?.mtime?.toISOString() ?? '',
            });
          }
        }
      }
      await walk(workspaceDir, '');
      return success(files);
    } catch (e) {
      return handleError(e);
    }
  });

  // 读取工作区文件内容（独立细粒度权限，同上）
  router.get('/api/ai/agents/:id/workspace/file', perm('ai:agent', 'workspace'), async (ctx) => {
    try {
      const id = (ctx.params as Record<string, string>).id!;
      const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? '';
      const filePath = ((ctx.query as Record<string, string>)?.path ?? '') as string;
      if (!filePath) return fail('path 参数必填', 400, 400);

      // 归属校验：agent 必须存在且属于当前租户
      const agent = await agentService.getById(id, tenantId);
      if (!agent) return fail('Agent 不存在', 404, 404);

      const workspaceBase = resolve(WORKSPACE_BASE);
      const workspaceDir = resolve(join(workspaceBase, id));
      if (workspaceDir !== workspaceBase && !workspaceDir.startsWith(workspaceBase + sep)) {
        return fail('路径不合法', 400, 400);
      }
      const fullPath = resolve(join(workspaceDir, filePath));

      // 安全检查：resolve 后 + 分隔符边界，确保路径在 workspace 内
      if (fullPath !== workspaceDir && !fullPath.startsWith(workspaceDir + sep)) {
        return fail('路径不合法', 400, 400);
      }
      if (!existsSync(fullPath)) return fail('文件不存在', 404, 404);

      const content = await readFile(fullPath, 'utf-8');
      return success({ path: filePath, content });
    } catch (e) {
      return handleError(e);
    }
  });

  return router;
}

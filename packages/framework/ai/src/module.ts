/**
 * AI 模块聚合 — 增强版
 *
 * 集成所有新能力：
 * - 多 provider（OpenAI / Anthropic / Google）
 * - Skill 系统
 * - Prompt Template 系统
 * - Session 树形存储
 * - Compaction
 * - Agent Harness
 * - 生命周期事件
 */
import { createRouter } from '@ventostack/core';
import type { Middleware, Router } from '@ventostack/core';
import type { EventBus } from '@ventostack/events';
import { join } from 'node:path';
import { sanitize } from '@ventostack/observability';

import type { ConfigEncryptor } from '@ventostack/core';
// LLM Gateway
import { createLLMGateway } from './llm-gateway';
import { createModelRegistry } from './llm-gateway/model-registry';
import type { ModelConfig, ModelRegistry } from './llm-gateway/model-registry';
import { createAnthropicProvider } from './llm-gateway/providers/anthropic';
import { createGoogleProvider } from './llm-gateway/providers/google';
import { createOpenAIProvider } from './llm-gateway/providers/openai';
import { createOpenAIResponsesProvider } from './llm-gateway/providers/openai-responses';
import type { LLMGateway, LLMProvider } from './llm-gateway/types';

// Agent Engine
import { type AgentConfig, type AgentLoop, createAgentLoop } from './agent-engine/agent-loop';
import { type AgentEventEmitter, createEventEmitter } from './agent-engine/events';
import {
  type AgentHarness,
  type AgentHarnessOptions,
  createAgentHarness,
} from './agent-engine/harness';
import { createMcpToolSource } from './agent-engine/mcp-tool-source';
import type {
  AfterToolCallContext,
  AfterToolCallResult,
  BeforeToolCallContext,
  BeforeToolCallResult,
} from './agent-engine/types';

// Knowledge Base
import { createKnowledgeBaseService } from './knowledge-base/service';
import type { KnowledgeBaseService } from './knowledge-base/types';

// Memory
import { createMemoryService } from './memory/service';
import type { MemoryService } from './memory/types';

// Skills
import { type SkillManager, createSkillManager } from './skills';

// Prompt Templates
import { type PromptTemplateManager, createPromptTemplateManager } from './prompt-templates';

import type { CompactionSettings } from './compaction/compaction';
// Session + Compaction
import { createLazyJsonlSessionStorage, createSession } from './session';

import { type AgentCrudService, createAgentRoutes } from './routes/agent';
import { createApprovalRoutes } from './routes/approval';
import { createAuditRoutes } from './routes/audit';
import { type ConversationService, createChatRoutes } from './routes/chat';
// Routes
import { createKnowledgeBaseRoutes } from './routes/knowledge-base';
import { createMcpServerRoutes } from './routes/mcp-server';
import { createProviderRoutes } from './routes/provider';
import { createSkillRoutes } from './routes/skill';
import { createToolRegistryRoutes } from './routes/tool-registry';
import { createAgentService } from './services/agent';
import { createApprovalService } from './services/approval';
import { createScopedKBService } from './services/kb-scope';
import { createMcpServerService } from './services/mcp-server';
import type { McpServerService } from './services/mcp-server';
import { createModelConfigService } from './services/model-config';
import { createProviderService } from './services/provider';
import { createSkillService } from './services/skill';
import { createSkillStoreService } from './services/skill-store';
import type { SkillStoreService } from './services/skill-store';
import { createToolRegistry } from './tool-registry';
import {
  createBase64Tool,
  createCalculatorTool,
  createDatetimeTool,
  createFileReadTool,
  createFileWriteTool,
  createFsCatTool,
  createFsFindTool,
  createFsGrepTool,
  createFsHeadTool,
  createFsLsTool,
  createFsTailTool,
  createHashTool,
  createJsonFormatTool,
  createKBBrowseTool,
  createKBFollowLinkTool,
  createKBOutlineTool,
  createKBReadTool,
  createKBSearchTool,
  createUuidTool,
  createWebFetchTool,
  createWebSearchTool,
} from './tools';
type SkillService = ReturnType<typeof createSkillService>;
import type { ModelConfigService } from './services/model-config';
type ScopedKBService = ReturnType<typeof createScopedKBService>;

// ---- Types ----

export interface AIModule {
  services: {
    llmGateway: LLMGateway;
    knowledgeBase: KnowledgeBaseService;
    agentLoop: AgentLoop;
    memory: MemoryService;
    modelRegistry: ModelRegistry;
    skillManager?: SkillManager;
    promptTemplateManager?: PromptTemplateManager;
    eventEmitter: AgentEventEmitter;
    skillStoreService: SkillStoreService;
    skillService: SkillService;
    modelConfigService: ModelConfigService;
    scopedKBService: ScopedKBService;
    mcpServerService: McpServerService;
  };
  router: Router;
  /** 创建 Agent Harness 实例 */
  createHarness(options: Partial<AgentHarnessOptions>): AgentHarness;
  init(): Promise<void>;
}

/** LLM Provider 配置 */
export interface LLMProviderConfig {
  /** Provider 名称 */
  name: string;
  /** 线协议；Provider 名称与协议解耦，兼容聚合网关及私有 Provider。 */
  apiFormat?: 'openai_chat' | 'openai_response' | 'anthropic' | 'google' | (string & {});
  /** API Key */
  apiKey: string;
  /** 自定义 Base URL */
  baseUrl?: string;
  /** Provider 专用请求头。 */
  headers?: Record<string, string>;
}

export interface LLMProviderFactoryConfig {
  name: string;
  apiKey: string;
  baseUrl?: string;
  headers?: Record<string, string>;
}

export type LLMProviderFactory = (config: LLMProviderFactoryConfig) => LLMProvider;

/**
 * 通知服务最小结构（由调用方注入，避免 framework 依赖 platform/notification）。
 * 与 @ventostack/notification 的 NotificationService 结构兼容。
 */
export interface NotificationServiceLike {
  send(params: {
    templateId?: string;
    receiverId: string;
    channel: string;
    title?: string;
    content: string;
    variables?: Record<string, unknown>;
  }): Promise<{ messageId: string }>;
}

export interface AIModuleDeps {
  db: unknown;
  cache?: unknown;
  /** 已构建的认证中间件（由调用方注入，framework 不依赖 platform/auth） */
  authMiddleware: Middleware;
  /** 权限中间件工厂（由调用方注入） */
  permMiddleware: (resource: string, action: string) => Middleware;
  /** 自定义协议 Adapter；键为 apiFormat。 */
  providerFactories?: Record<string, LLMProviderFactory>;
  eventBus: EventBus;
  notification?: NotificationServiceLike;
  /** LLM provider 配置列表 */
  llmProviders: LLMProviderConfig[];
  /** Provider API Key 加密器 */
  credentialEncryptor: ConfigEncryptor;
  /** 默认模型 ID */
  defaultModel: string;
  /** 存储路径 */
  storagePath: string;
  /** Skill 目录列表 */
  skillDirs?: string[];
  /** Prompt Template 路径列表 */
  templatePaths?: string[];
  /** 自定义模型配置 */
  customModels?: ModelConfig[];
  /** Agent Harness 钩子 */
  hooks?: {
    beforeToolCall?: (
      context: BeforeToolCallContext,
      signal?: AbortSignal,
    ) => Promise<BeforeToolCallResult | undefined>;
    afterToolCall?: (
      context: AfterToolCallContext,
      signal?: AbortSignal,
    ) => Promise<AfterToolCallResult | undefined>;
    transformContext?: (
      messages: import('./llm-gateway/types').ChatMessage[],
      signal?: AbortSignal,
    ) => Promise<import('./llm-gateway/types').ChatMessage[]> | import('./llm-gateway/types').ChatMessage[];
    prepareNextTurn?: (
      context: import('./agent-engine/types').PrepareNextTurnContext,
      signal?: AbortSignal,
    ) => Promise<import('./agent-engine/types').AgentLoopTurnUpdate | undefined> | import('./agent-engine/types').AgentLoopTurnUpdate | undefined;
    getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
    dynamicToolResolver?: (
      toolName: string,
      tenantId: string,
    ) => Promise<import('./agent-engine/types').AgentTool | undefined> | import('./agent-engine/types').AgentTool | undefined;
  };
  /** 压缩设置 */
  compactionSettings?: CompactionSettings;
  /** 动态 system prompt */
  systemPrompt?: AgentHarnessOptions['systemPrompt'];
  /** 分布式追踪器（@ventostack/observability）；提供时自动埋 AI span */
  tracer?: import("@ventostack/observability").Tracer;
  /** 父 span 上下文 */
  parentSpanContext?: { traceId: string; spanId: string };
}

// ---- Provider 创建 ----

/** 从 agent 的 config JSON 中提取深度研究配置（存在 research 字段时返回） */
function extractResearch(config: unknown): { research: AgentConfig['research'] } | Record<string, never> {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return {};
  const research = (config as Record<string, unknown>).research;
  if (!research || typeof research !== 'object' || Array.isArray(research)) return {};
  const depth = (research as Record<string, unknown>).depth;
  if (depth === 'quick' || depth === 'normal' || depth === 'deep') {
    // 透传自定义预算字段（创建 Agent 时可按需覆盖深度预设；非法值忽略）
    const raw = research as Record<string, unknown>;
    const out: AgentConfig['research'] = { depth };
    for (const key of ['maxIterations', 'maxTokensPerTurn', 'searchCount', 'maxSubtasks', 'maxSubtaskTurns'] as const) {
      const value = raw[key];
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        out[key] = value;
      }
    }
    return { research: out };
  }
  return {};
}

export function createConfiguredProvider(
  config: LLMProviderConfig,
  customFactories: Record<string, LLMProviderFactory> = {},
): LLMProvider {
  const providerConfig = {
    name: config.name,
    apiKey: config.apiKey,
    ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
    ...(config.headers !== undefined ? { headers: config.headers } : {}),
  };
  const apiFormat = config.apiFormat
    ?? (config.name === 'anthropic' ? 'anthropic' : config.name === 'google' ? 'google' : 'openai_chat');
  const customFactory = customFactories[apiFormat];
  if (customFactory) return customFactory(providerConfig);
  switch (apiFormat) {
    case 'openai_chat':
      return createOpenAIProvider(providerConfig);
    case 'openai_response':
      return createOpenAIResponsesProvider(providerConfig);
    case 'anthropic':
      return createAnthropicProvider(providerConfig);
    case 'google':
      return createGoogleProvider(providerConfig);
    default:
      throw new Error(`Unsupported provider API format: ${apiFormat}`);
  }
}

// ---- Module Factory ----

export function createAIModule(deps: AIModuleDeps): AIModule {
  const { db, authMiddleware, permMiddleware, eventBus, storagePath, cache } = deps;

  const providerService = createProviderService({
    db: db as import('@ventostack/database').Database,
    credentialEncryptor: deps.credentialEncryptor,
    ...(cache !== undefined
      ? {
          cache: {
            get: (key: string) => (cache as import('@ventostack/cache').Cache).get<string>(key),
            set: (key: string, value: string, ttl?: number) =>
              (cache as import('@ventostack/cache').Cache).set(
                key,
                value,
                ttl === undefined ? undefined : { ttl },
              ),
          },
        }
      : {}),
  });

  // 审批服务（高风险工具人工审批；授权链路见下方 authorizeToolCall）
  const approvalService = createApprovalService({
    db: db as import('@ventostack/database').Database,
    eventBus,
  });

  // 创建 LLM providers
  const providers: LLMProvider[] = deps.llmProviders.map((config) =>
    createConfiguredProvider(config, deps.providerFactories),
  );

  // 创建 LLM Gateway
  const llmGateway = createLLMGateway({
    providers,
    defaultModel: deps.defaultModel,
    async resolveProvider(modelRef, tenantId) {
      let effectiveModel = modelRef;
      if (effectiveModel === 'default') {
        // 双轨对齐：优先读取前端设置页写入的 default_model，兼容历史 model_purpose_default_chat
        effectiveModel = (await providerService.getConfig('default_model'))
          ?? (await providerService.getConfig('model_purpose_default_chat'))
          ?? '';
      }
      if (!effectiveModel) return null;
      const runtime = await providerService.resolveRuntimeModel(
        effectiveModel,
        tenantId || 'default',
      );
      if (!runtime) return null;
      const common = {
        name: runtime.providerName,
        apiKey: runtime.apiKey,
        baseUrl: runtime.baseUrl,
        headers: runtime.headers,
      };
      const provider = createConfiguredProvider(
        {
          name: runtime.providerName,
          apiFormat: runtime.apiFormat,
          apiKey: runtime.apiKey,
          baseUrl: runtime.baseUrl,
          headers: runtime.headers,
        },
        deps.providerFactories,
      );
      return { provider, model: runtime.modelId };
    },
  });

  // 创建 Model Registry
  const modelRegistry = createModelRegistry(true);
  if (deps.customModels) {
    modelRegistry.registerAll(deps.customModels);
  }

  // 创建事件发射器
  const eventEmitter = createEventEmitter();

  // 创建 Knowledge Base
  const knowledgeBase = createKnowledgeBaseService({
    storagePath: `${storagePath}/knowledge-bases`,
    db,
  });

  // 创建 Memory
  const memory = createMemoryService({
    storagePath: `${storagePath}/memories`,
    db,
  });

  // 创建 Skill Manager
  const skillManager = deps.skillDirs ? createSkillManager({ dirs: deps.skillDirs }) : undefined;
  const skillStoreService = createSkillStoreService();
  const skillService = createSkillService({
    db,
    eventBus,
    storeService: skillStoreService,
    storagePath: `${storagePath}/skills`,
  });

  // 创建 Prompt Template Manager
  const promptTemplateManager = deps.templatePaths
    ? createPromptTemplateManager({ paths: deps.templatePaths })
    : undefined;

  // 创建工具注册表并注册所有内置工具
  // KB 等租户相关工具按租户绑定：对话路由按请求 tenantId 构建请求级注册表（见 createChatRoutes options），
  // 此处的默认注册表供工具发现/管理路由使用。
  function buildToolRegistry(tenantId: string): ToolRegistry {
    // 防御性校验：tenantId 会拼进文件工具的 allowedPaths，
    // 含路径分隔符或 ../ 的异常值会移动基准目录造成跨租户读写（fail-closed）
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(tenantId)) {
      throw new Error(`Invalid tenantId for tool registry: ${tenantId}`);
    }
    const registry = createToolRegistry();

    // 无依赖工具
    registry.register(createCalculatorTool());
    registry.register(createDatetimeTool());
    registry.register(createWebFetchTool());
    registry.register(createWebSearchTool());
    registry.register(createJsonFormatTool());
    registry.register(createUuidTool());
    registry.register(createBase64Tool());
    registry.register(createHashTool());

    // 知识库工具（tenantId 为请求级租户标识：memory 隔离、skill/KB 归属、审计）
    registry.register(createKBBrowseTool({ kbService: knowledgeBase, tenantId }));
    registry.register(createKBReadTool({ kbService: knowledgeBase, tenantId }));
    registry.register(createKBSearchTool({ kbService: knowledgeBase, tenantId }));
    registry.register(createKBFollowLinkTool({ kbService: knowledgeBase, tenantId }));
    registry.register(createKBOutlineTool({ kbService: knowledgeBase, tenantId }));

    // 文件系统工具
    registry.register(createFsLsTool(knowledgeBase, ''));
    registry.register(createFsCatTool(knowledgeBase, ''));
    registry.register(createFsGrepTool(knowledgeBase, ''));
    registry.register(createFsFindTool(knowledgeBase, ''));
    registry.register(createFsHeadTool(knowledgeBase, ''));
    registry.register(createFsTailTool(knowledgeBase, ''));

    // 文件读写工具（租户作用域：仅允许访问本租户目录，防止跨租户文件读取/写入）
    const tenantRoot = join(storagePath, 'tenants', tenantId);
    registry.register(createFileReadTool({ allowedPaths: [tenantRoot] }));
    registry.register(createFileWriteTool({ allowedPaths: [tenantRoot] }));

    return registry;
  }

  // 默认租户注册表（供工具发现/管理路由；对话按请求 tenantId 另行构建）
  const toolRegistry = buildToolRegistry('default');

  // Agent CRUD 服务（先创建，供 AgentLoop 使用）
  const agentDbService = createAgentService({
    db: db as import('@ventostack/database').Database,
    // 依赖引用校验：model / 知识库 / Skill / MCP 引用必须有效且归属当前租户
    validateRefs: async (params, tenantId) => {
      const tid = tenantId || 'default';
      if (params.model && params.model !== 'default') {
        const inRegistry = modelRegistry.has(params.model);
        let runtime = null;
        if (!inRegistry) {
          try {
            runtime = await providerService.resolveRuntimeModel(params.model, tid);
          } catch {
            runtime = null;
          }
        }
        if (!inRegistry && !runtime) {
          throw new Error(`模型 ${params.model} 未配置或不可用`);
        }
      }
      for (const kbId of params.knowledgeBaseIds ?? []) {
        const kb = await knowledgeBase.getById(kbId, tid);
        if (!kb) throw new Error(`知识库 ${kbId} 不存在`);
      }
      for (const skillId of params.skillIds ?? []) {
        const skill = await skillService.getById(skillId, tid);
        if (!skill) throw new Error(`Skill ${skillId} 不存在或不属于当前租户`);
      }
      for (const mcpId of params.mcpServerIds ?? []) {
        const mcp = await mcpServerService.getById(mcpId, tid);
        if (!mcp) throw new Error(`MCP Server ${mcpId} 不存在或不属于当前租户`);
      }
    },
  });
  const agentCrudService: AgentCrudService = {
    create: (params) =>
      agentDbService.create(params as Parameters<typeof agentDbService.create>[0]),
    getById: (id, tenantId) =>
      agentDbService.getById(id, tenantId).then((item): AgentConfig | null => {
        if (!item) return null;
        return {
          id: item.id,
          name: item.name,
          systemPrompt: item.systemPrompt,
          model: item.model,
          ...(Array.isArray(item.tools) ? { tools: item.tools as string[] } : {}),
          ...(Array.isArray(item.knowledgeBaseIds) ? { knowledgeBaseIds: item.knowledgeBaseIds as string[] } : {}),
          ...(Array.isArray(item.skillIds) ? { skillIds: item.skillIds as string[] } : {}),
          ...(Array.isArray(item.mcpServerIds) ? { mcpServerIds: item.mcpServerIds as string[] } : {}),
          ...(typeof item.maxIterations === 'number' ? { maxIterations: item.maxIterations } : {}),
          ...(typeof item.maxTokensPerTurn === 'number' ? { maxTokensPerTurn: item.maxTokensPerTurn } : {}),
          ...(item.memoryConfig ? { memoryConfig: item.memoryConfig } : {}),
          ...(extractResearch(item.config)),
          tenantId: item.tenantId,
        };
      }),
    list: (params) => agentDbService.list(params),
    update: (id, params, tenantId, opts) =>
      agentDbService.update(id, params as Parameters<typeof agentDbService.update>[1], tenantId, opts),
    delete: (id, tenantId, opts) => agentDbService.delete(id, tenantId, opts),
    publish: (id, tenantId, opts) => agentDbService.publish(id, tenantId, opts),
  };

  const allowedMcpCommands = (process.env.AI_MCP_STDIO_COMMANDS ?? '')
    .split(',')
    .map((cmd) => cmd.trim())
    .filter((cmd) => cmd.length > 0);
  const allowedMcpHosts = (process.env.AI_MCP_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host.length > 0);
  const mcpServerService = createMcpServerService({
    db: db as import('@ventostack/database').Database,
    allowedStdioCommands: allowedMcpCommands,
    allowedHttpHosts: allowedMcpHosts,
    credentialEncryptor: deps.credentialEncryptor,
  });
  const mcpToolSource = createMcpToolSource(mcpServerService);

  // 创建 Agent Loop
  const agentLoop = createAgentLoop({
    llmGateway,
    knowledgeBase,
    memory,
    eventEmitter,
    toolRegistry,
    agentService: agentCrudService,
    beforeToolCall: deps.hooks?.beforeToolCall,
    afterToolCall: deps.hooks?.afterToolCall,
    transformContext: deps.hooks?.transformContext,
    prepareNextTurn: deps.hooks?.prepareNextTurn,
    getApiKey: deps.hooks?.getApiKey,
    dynamicToolResolver: deps.hooks?.dynamicToolResolver,
    // 高风险工具审批：已批准（未过期且参数一致）直接放行；否则创建审批请求并拒绝本次执行
    authorizeToolCall: async ({ toolCall, args, context }) => {
      const recent = await approvalService.findRecentApproved(
        toolCall.name,
        args as Record<string, unknown>,
        context.userId,
        context.tenantId,
      );
      if (recent) return { approved: true, reason: '该工具此前已获审批' };
      try {
        const request = await approvalService.request(
          toolCall.name,
          args as Record<string, unknown>,
          context.userId,
          context.tenantId,
        );
        return {
          approved: false,
          reason: `工具 ${toolCall.name} 需要人工审批：已创建审批请求 ${request.id}，请管理员审批后重试`,
        };
      } catch (err) {
        return {
          approved: false,
          reason: `审批请求创建失败：${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
    // 工具审计：每次工具执行写入 ai_tool_log（入参/出参先经 sanitize 递归脱敏；失败仅告警，不阻断对话）
    auditToolCall: async (log) => {
      try {
        await (db as import('@ventostack/database').Database).raw(
          `INSERT INTO ai_tool_log (id, conversation_id, tool_name, input, output, status, duration, user_id, tenant_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            crypto.randomUUID(),
            log.sessionId ?? null,
            log.toolName,
            JSON.stringify(sanitize(log.input)),
            JSON.stringify(sanitize(log.output)),
            log.status,
            log.duration,
            log.userId,
            log.tenantId,
          ],
        );
      } catch (err) {
        console.error('[ai] 写入工具审计日志失败:', err);
      }
    },
    tracer: deps.tracer,
    parentSpanContext: deps.parentSpanContext,
    mcpToolSource,
    async resolveSkills(skillIds, tenantId) {
      const skills = await Promise.all(skillIds.map((id) => skillService.getById(id, tenantId)));
      return skills.flatMap((skill) => {
        if (!skill?.enabled || !skill.skillMdContent) return [];
        const content = skill.skillMdContent.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
        return [{
          name: skill.slug,
          description: skill.description ?? skill.name,
          content,
          filePath: `${storagePath}/skills/${skill.slug}/${skill.installedVersion ?? 'current'}/SKILL.md`,
        }];
      });
    },
  });

  // 创建中间件（由调用方注入，见 AIModuleDeps）
  const perm = deps.permMiddleware;

  // 创建路由
  const kbRouter = createKnowledgeBaseRoutes(knowledgeBase, authMiddleware, perm, providerService);
  const providerRouter = createProviderRoutes(providerService, authMiddleware, perm);
  const agentRouter = createAgentRoutes(agentCrudService, authMiddleware, perm, {
    storagePath: `${storagePath}/skills/.workspace`,
  });
  // 会话服务：基于 memory（JSONL 用户级会话存储），实现真实 CRUD 与历史查询
  const conversationService: ConversationService = {
    async create(params) {
      const { sessionId } = await memory.createSession({
        userId: params.userId,
        agentId: params.agentId,
        tenantId: params.tenantId,
      });
      return { id: sessionId };
    },
    async getById(id, userId, tenantId) {
      const session = await memory.getSession(id, { tenantId, userId });
      if (!session) return null;
      return {
        id: session.sessionId,
        agentId: session.agentId,
        userId: session.userId,
        title: session.title,
        status: session.status,
        messageCount: session.messageCount,
        tenantId: session.tenantId,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
      };
    },
    async list(params) {
      const sessions = await memory.listSessions(
        { tenantId: params.tenantId, userId: params.userId },
        params.agentId,
      );
      return sessions.map((s) => ({
        id: s.sessionId,
        agentId: s.agentId,
        userId: s.userId,
        title: s.title,
        status: s.status,
        messageCount: s.messageCount,
        tenantId: s.tenantId,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      }));
    },
    async delete(id, userId, tenantId) {
      await memory.deleteSession(id, { tenantId, userId });
    },
    async getMessages(id, userId, tenantId, limit) {
      return memory.getHistory(id, { tenantId, userId }, limit ?? 50);
    },
  };

  const chatRouter = createChatRoutes(agentLoop, conversationService, authMiddleware, perm, memory, {
    // 对话/流式请求按 ctx.user.tenantId 构建请求级工具注册表（KB 工具绑定请求租户）
    createTenantToolRegistry: buildToolRegistry,
  });

  // Skill 服务
  const modelConfigService = createModelConfigService({ db });
  const scopedKBService = createScopedKBService({ db, eventBus });

  // Skill 路由
  const skillRouter = createSkillRoutes(skillService, skillStoreService, authMiddleware, perm, {
    storagePath: `${storagePath}/skills`,
    workspacePath: `${storagePath}/skills/.workspace`,
  });

  // MCP Server 服务
  const mcpRouter = createMcpServerRoutes(mcpServerService, authMiddleware, perm);

  // 工具注册表路由
  const toolRegistryRouter = createToolRegistryRoutes(toolRegistry, authMiddleware, perm);

  // 合并路由
  const router = createRouter();
  router.merge(kbRouter);
  router.merge(agentRouter);
  router.merge(chatRouter);
  router.merge(providerRouter);
  router.merge(skillRouter);
  router.merge(mcpRouter);
  router.merge(toolRegistryRouter);

  // 审计日志路由
  const auditRouter = createAuditRoutes(
    db as { raw: (sql: string, params?: unknown[]) => Promise<unknown[]> },
    authMiddleware,
    perm,
  );
  router.merge(auditRouter);

  // 审批路由
  const approvalRouter = createApprovalRoutes(approvalService, authMiddleware, perm);
  router.merge(approvalRouter);

  // 创建 Harness 工厂
  function createHarness(partialOptions: Partial<AgentHarnessOptions>): AgentHarness {
    // 为 harness 创建独立的 session
    const sessionId = crypto.randomUUID();
    const sessionPath = `${storagePath}/sessions/${sessionId}.jsonl`;

    // 异步初始化 session storage
    const harnessOptions: AgentHarnessOptions = {
      gateway: llmGateway,
      session:
        partialOptions.session ??
        createSession(createLazyJsonlSessionStorage(sessionPath, {
          cwd: storagePath,
          sessionId,
        })),
      skillManager,
      promptTemplateManager,
      modelRegistry,
      eventEmitter,
      modelId: deps.defaultModel,
      compactionSettings: deps.compactionSettings,
      systemPrompt: deps.systemPrompt,
      tracer: deps.tracer,
      parentSpanContext: deps.parentSpanContext,
      ...partialOptions,
    };

    return createAgentHarness(harnessOptions);
  }

  return {
    services: {
      llmGateway,
      knowledgeBase,
      agentLoop,
      memory,
      modelRegistry,
      skillManager,
      promptTemplateManager,
      eventEmitter,
      skillStoreService,
      skillService,
      modelConfigService,
      scopedKBService,
      mcpServerService,
    },
    router,
    createHarness,
    async init() {
      await providerService.encryptStoredCredentials();

      // 初始化 skills
      if (skillManager) {
        const { diagnostics } = await skillManager.reload();
        if (diagnostics.length > 0) {
          console.warn('[ai] Skill loading diagnostics:', diagnostics);
        }
      }

      // 初始化 prompt templates
      if (promptTemplateManager) {
        const { diagnostics } = await promptTemplateManager.reload();
        if (diagnostics.length > 0) {
          console.warn('[ai] Template loading diagnostics:', diagnostics);
        }
      }

      // 注册事件监听
      if (eventBus) {
        eventBus.on('ai.kb.updated', async (_data: { kbId: string }) => {
          // 清除相关缓存
        });
      }
    },
  };
}

import type { JWTManager, RBAC } from '@ventostack/auth';
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
import type { Router } from '@ventostack/core';
import type { EventBus } from '@ventostack/events';
import type { NotificationService } from '@ventostack/notification';

import type { ConfigEncryptor } from '@ventostack/core';
// LLM Gateway
import { createLLMGateway } from './llm-gateway';
import { createModelRegistry } from './llm-gateway/model-registry';
import type { ModelConfig, ModelRegistry } from './llm-gateway/model-registry';
import { createAnthropicProvider } from './llm-gateway/providers/anthropic';
import { createGoogleProvider } from './llm-gateway/providers/google';
import { createOpenAIProvider } from './llm-gateway/providers/openai';
import type { LLMGateway, LLMProvider } from './llm-gateway/types';

// Agent Engine
import { type AgentLoop, createAgentLoop } from './agent-engine/agent-loop';
import { type AgentEventEmitter, createEventEmitter } from './agent-engine/events';
import {
  type AgentHarness,
  type AgentHarnessOptions,
  createAgentHarness,
} from './agent-engine/harness';
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
import { createSession } from './session';

import { type AgentCrudService, createAgentRoutes } from './routes/agent';
import { createAuditRoutes } from './routes/audit';
import { type ConversationService, createChatRoutes } from './routes/chat';
// Routes
import { createKnowledgeBaseRoutes } from './routes/knowledge-base';
import { createMcpServerRoutes } from './routes/mcp-server';
import { createProviderRoutes } from './routes/provider';
import { createSkillRoutes } from './routes/skill';
import { createToolRegistryRoutes } from './routes/tool-registry';
import { createAgentService } from './services/agent';
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
  createKBReadTool,
  createKBSearchTool,
  createUuidTool,
  createWebFetchTool,
  createWebSearchTool,
} from './tools';
type SkillService = ReturnType<typeof createSkillService>;
import type { ModelConfigService } from './services/model-config';
type ScopedKBService = ReturnType<typeof createScopedKBService>;

// Auth
import { createAuthMiddleware, createPermMiddleware } from '@ventostack/auth';

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
  name: 'openai' | 'anthropic' | 'google';
  /** API Key */
  apiKey: string;
  /** 自定义 Base URL */
  baseUrl?: string;
}

export interface AIModuleDeps {
  db: unknown;
  cache?: unknown;
  jwt: JWTManager;
  jwtSecret: string;
  rbac?: RBAC;
  eventBus: EventBus;
  notification?: NotificationService;
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
  };
  /** 压缩设置 */
  compactionSettings?: CompactionSettings;
  /** 动态 system prompt */
  systemPrompt?: AgentHarnessOptions['systemPrompt'];
}

// ---- Provider 创建 ----

function createProvider(config: LLMProviderConfig): LLMProvider {
  const providerConfig = {
    apiKey: config.apiKey,
    ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
  };
  switch (config.name) {
    case 'openai':
      return createOpenAIProvider(providerConfig);
    case 'anthropic':
      return createAnthropicProvider(providerConfig);
    case 'google':
      return createGoogleProvider(providerConfig);
    default:
      throw new Error(`Unknown provider: ${config.name}`);
  }
}

// ---- Module Factory ----

export function createAIModule(deps: AIModuleDeps): AIModule {
  const { db, jwt, jwtSecret, rbac, eventBus, storagePath, cache } = deps;

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

  // 创建 LLM providers
  const providers: LLMProvider[] = deps.llmProviders.map(createProvider);

  // 创建 LLM Gateway
  const llmGateway = createLLMGateway({
    providers,
    defaultModel: deps.defaultModel,
    async resolveProvider(modelRef, tenantId) {
      let effectiveModel = modelRef;
      if (effectiveModel === 'default') {
        effectiveModel = (await providerService.getConfig('model_purpose_default_chat')) ?? '';
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
      const provider =
        runtime.apiFormat === 'anthropic'
          ? createAnthropicProvider(common)
          : createOpenAIProvider(common);
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

  // 创建 Prompt Template Manager
  const promptTemplateManager = deps.templatePaths
    ? createPromptTemplateManager({ paths: deps.templatePaths })
    : undefined;

  // 创建工具注册表并注册所有内置工具
  const toolRegistry = createToolRegistry();

  // 无依赖工具
  toolRegistry.register(createCalculatorTool());
  toolRegistry.register(createDatetimeTool());
  toolRegistry.register(createWebFetchTool());
  toolRegistry.register(createWebSearchTool());
  toolRegistry.register(createJsonFormatTool());
  toolRegistry.register(createUuidTool());
  toolRegistry.register(createBase64Tool());
  toolRegistry.register(createHashTool());

  // 知识库工具
  toolRegistry.register(createKBBrowseTool({ kbService: knowledgeBase, tenantId: 'default' }));
  toolRegistry.register(createKBReadTool({ kbService: knowledgeBase, tenantId: 'default' }));
  toolRegistry.register(createKBSearchTool({ kbService: knowledgeBase, tenantId: 'default' }));
  toolRegistry.register(createKBFollowLinkTool({ kbService: knowledgeBase, tenantId: 'default' }));

  // 文件系统工具
  toolRegistry.register(createFsLsTool(knowledgeBase, ''));
  toolRegistry.register(createFsCatTool(knowledgeBase, ''));
  toolRegistry.register(createFsGrepTool(knowledgeBase, ''));
  toolRegistry.register(createFsFindTool(knowledgeBase, ''));
  toolRegistry.register(createFsHeadTool(knowledgeBase, ''));
  toolRegistry.register(createFsTailTool(knowledgeBase, ''));

  // 文件读写工具
  toolRegistry.register(createFileReadTool({ allowedPaths: [storagePath] }));
  toolRegistry.register(createFileWriteTool({ allowedPaths: [storagePath] }));

  // Agent CRUD 服务（先创建，供 AgentLoop 使用）
  const agentDbService = createAgentService({ db: db as import('@ventostack/database').Database });
  const agentCrudService: AgentCrudService = {
    create: (params) =>
      agentDbService.create(params as Parameters<typeof agentDbService.create>[0]),
    getById: (id, tenantId) => agentDbService.getById(id, tenantId),
    list: (params) => agentDbService.list(params),
    update: (id, params, tenantId) =>
      agentDbService.update(id, params as Parameters<typeof agentDbService.update>[1], tenantId),
    delete: (id, tenantId) => agentDbService.delete(id, tenantId),
    publish: (id, tenantId) => agentDbService.publish(id, tenantId),
  };

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
  });

  // 创建中间件
  const authMiddleware = createAuthMiddleware(jwt, jwtSecret);
  const perm = rbac
    ? createPermMiddleware(rbac)
    : () => async (_ctx: unknown, next: () => Promise<Response>) => next();

  // 创建路由
  const kbRouter = createKnowledgeBaseRoutes(knowledgeBase, authMiddleware, perm, providerService);
  const providerRouter = createProviderRoutes(providerService, authMiddleware, perm);
  const agentRouter = createAgentRoutes(agentCrudService, authMiddleware, perm, {
    storagePath: `${storagePath}/skills/.workspace`,
  });
  const conversationService: ConversationService = {
    async create(_params) {
      return { id: crypto.randomUUID() };
    },
    async getById(_id, _userId) {
      return null;
    },
    async list(_params) {
      return [];
    },
    async delete(_id, _userId) {},
  };

  const chatRouter = createChatRoutes(agentLoop, conversationService, authMiddleware, perm);

  // Skill 服务
  const skillStoreService = createSkillStoreService();
  const skillService = createSkillService({
    db,
    eventBus,
    storeService: skillStoreService,
    storagePath: `${storagePath}/skills`,
  });
  const modelConfigService = createModelConfigService({ db });
  const scopedKBService = createScopedKBService({ db, eventBus });

  // Skill 路由
  const skillRouter = createSkillRoutes(skillService, skillStoreService, authMiddleware, perm, {
    storagePath: `${storagePath}/skills`,
    workspacePath: `${storagePath}/skills/.workspace`,
  });

  // MCP Server 服务
  const allowedMcpCommands = (process.env.AI_MCP_STDIO_COMMANDS ?? '')
    .split(',')
    .map((cmd) => cmd.trim())
    .filter((cmd) => cmd.length > 0);
  const mcpServerService = createMcpServerService({
    db: db as import('@ventostack/database').Database,
    allowedStdioCommands: allowedMcpCommands,
  }) as unknown as McpServerService;
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
        createSession(
          // 注意：这里需要异步初始化，实际使用时应在 init() 中完成
          {
            getMetadata: () =>
              Promise.resolve({
                id: sessionId,
                createdAt: new Date().toISOString(),
                path: sessionPath,
              }),
            getLeafId: () => Promise.resolve(null),
            setLeafId: () => Promise.resolve(),
            createEntryId: () => Promise.resolve(crypto.randomUUID().slice(0, 8)),
            appendEntry: () => Promise.resolve(),
            getEntry: () => Promise.resolve(undefined),
            getEntries: () => Promise.resolve([]),
            getPathToRoot: () => Promise.resolve([]),
            findEntries: () => Promise.resolve([]),
            getLabel: () => Promise.resolve(undefined),
          },
        ),
      skillManager,
      promptTemplateManager,
      modelRegistry,
      eventEmitter,
      modelId: deps.defaultModel,
      compactionSettings: deps.compactionSettings,
      systemPrompt: deps.systemPrompt,
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

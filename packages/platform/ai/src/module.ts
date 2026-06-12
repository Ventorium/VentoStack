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
import { createRouter } from "@ventostack/core";
import type { Router } from "@ventostack/core";
import type { JWTManager, RBAC } from "@ventostack/auth";
import type { EventBus } from "@ventostack/events";
import type { NotificationService } from "@ventostack/notification";

// LLM Gateway
import { createLLMGateway } from "./llm-gateway";
import type { LLMProvider, LLMGateway } from "./llm-gateway/types";
import { createOpenAIProvider } from "./llm-gateway/providers/openai";
import { createAnthropicProvider } from "./llm-gateway/providers/anthropic";
import { createGoogleProvider } from "./llm-gateway/providers/google";
import { createModelRegistry } from "./llm-gateway/model-registry";
import type { ModelRegistry, ModelConfig } from "./llm-gateway/model-registry";

// Agent Engine
import { createAgentLoop, type AgentLoop } from "./agent-engine/agent-loop";
import { createAgentHarness, type AgentHarness, type AgentHarnessOptions } from "./agent-engine/harness";
import { createEventEmitter, type AgentEventEmitter } from "./agent-engine/events";
import type { AgentTool, BeforeToolCallContext, BeforeToolCallResult, AfterToolCallContext, AfterToolCallResult } from "./agent-engine/types";

// Knowledge Base
import { createKnowledgeBaseService } from "./knowledge-base/service";
import type { KnowledgeBaseService } from "./knowledge-base/types";

// Memory
import { createMemoryService, type MemoryService } from "./memory/service";

// Skills
import { createSkillManager, type SkillManager } from "./skills";
import type { Skill } from "./skills/types";

// Prompt Templates
import { createPromptTemplateManager, type PromptTemplateManager } from "./prompt-templates";
import type { PromptTemplate } from "./prompt-templates/types";

// Session + Compaction
import { createJsonlSessionStorage, createSession, type Session } from "./session";
import type { CompactionSettings } from "./compaction/compaction";

// Routes
import { createKnowledgeBaseRoutes } from "./routes/knowledge-base";
import { createAgentRoutes, type AgentCrudService } from "./routes/agent";
import { createAgentService } from "./services/agent";
import { createChatRoutes, type ConversationService } from "./routes/chat";
import { createProviderRoutes } from "./routes/provider";
import { createAuditRoutes } from "./routes/audit";
import { createProviderService } from "./services/provider";

// Auth
import { createAuthMiddleware, createPermMiddleware } from "./middlewares/auth-guard";

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
  };
  router: Router;
  /** 创建 Agent Harness 实例 */
  createHarness(options: Partial<AgentHarnessOptions>): AgentHarness;
  init(): Promise<void>;
}

/** LLM Provider 配置 */
export interface LLMProviderConfig {
  /** Provider 名称 */
  name: "openai" | "anthropic" | "google";
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
  systemPrompt?: AgentHarnessOptions["systemPrompt"];
}

// ---- Provider 创建 ----

function createProvider(config: LLMProviderConfig): LLMProvider {
  switch (config.name) {
    case "openai":
      return createOpenAIProvider({ apiKey: config.apiKey, baseUrl: config.baseUrl });
    case "anthropic":
      return createAnthropicProvider({ apiKey: config.apiKey, baseUrl: config.baseUrl });
    case "google":
      return createGoogleProvider({ apiKey: config.apiKey, baseUrl: config.baseUrl });
    default:
      throw new Error(`Unknown provider: ${config.name}`);
  }
}

// ---- Module Factory ----

export function createAIModule(deps: AIModuleDeps): AIModule {
  const { db, jwt, jwtSecret, rbac, eventBus, storagePath } = deps;

  // 创建 LLM providers
  const providers: LLMProvider[] = deps.llmProviders.map(createProvider);

  // 创建 LLM Gateway
  const llmGateway = createLLMGateway({
    providers,
    defaultModel: deps.defaultModel,
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
  const skillManager = deps.skillDirs
    ? createSkillManager({ dirs: deps.skillDirs })
    : undefined;

  // 创建 Prompt Template Manager
  const promptTemplateManager = deps.templatePaths
    ? createPromptTemplateManager({ paths: deps.templatePaths })
    : undefined;

  // 创建 Agent Loop（向后兼容）
  const agentLoop = createAgentLoop({
    llmGateway,
    knowledgeBase,
    memory,
    eventEmitter,
    beforeToolCall: deps.hooks?.beforeToolCall,
    afterToolCall: deps.hooks?.afterToolCall,
  });

  // 创建中间件
  const authMiddleware = createAuthMiddleware(jwt, jwtSecret);
  const perm = rbac
    ? createPermMiddleware(rbac)
    : () => async (_ctx: unknown, next: () => Promise<Response>) => next();

  // 创建路由
  const kbRouter = createKnowledgeBaseRoutes(knowledgeBase, authMiddleware, perm);

  // Provider 服务
  const providerService = createProviderService({ db: db as import("@ventostack/database").Database });
  const providerRouter = createProviderRoutes(providerService, authMiddleware, perm);

  // Agent CRUD 服务
  const agentDbService = createAgentService({ db: db as import("@ventostack/database").Database });
  const agentCrudService: AgentCrudService = {
    create: (params) => agentDbService.create(params as Parameters<typeof agentDbService.create>[0]),
    getById: (id, tenantId) => agentDbService.getById(id, tenantId),
    list: (params) => agentDbService.list(params),
    update: (id, params, tenantId) => agentDbService.update(id, params as Parameters<typeof agentDbService.update>[1], tenantId),
    delete: (id, tenantId) => agentDbService.delete(id, tenantId),
    publish: (id, tenantId) => agentDbService.publish(id, tenantId),
  };

  const agentRouter = createAgentRoutes(agentCrudService, authMiddleware, perm);

  // 对话服务
  const conversationService: ConversationService = {
    async create(params) { return { id: crypto.randomUUID() }; },
    async getById(id, userId) { return null; },
    async list(params) { return []; },
    async delete(id, userId) {},
  };

  const chatRouter = createChatRoutes(agentLoop, conversationService, authMiddleware, perm);

  // 合并路由
  const router = createRouter();
  router.merge(kbRouter);
  router.merge(agentRouter);
  router.merge(chatRouter);
  router.merge(providerRouter);

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
      session: partialOptions.session ?? createSession(
        // 注意：这里需要异步初始化，实际使用时应在 init() 中完成
        {
          getMetadata: () => Promise.resolve({ id: sessionId, createdAt: new Date().toISOString(), path: sessionPath }),
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
    },
    router,
    createHarness,
    async init() {
      // 初始化 skills
      if (skillManager) {
        const { diagnostics } = await skillManager.reload();
        if (diagnostics.length > 0) {
          console.warn("[ai] Skill loading diagnostics:", diagnostics);
        }
      }

      // 初始化 prompt templates
      if (promptTemplateManager) {
        const { diagnostics } = await promptTemplateManager.reload();
        if (diagnostics.length > 0) {
          console.warn("[ai] Template loading diagnostics:", diagnostics);
        }
      }

      // 注册事件监听
      if (eventBus) {
        eventBus.on("ai.kb.updated", async (data: { kbId: string }) => {
          // 清除相关缓存
        });
      }
    },
  };
}

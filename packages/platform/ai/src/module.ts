/**
 * AI 模块聚合
 */
import { createRouter } from "@ventostack/core";
import type { Router } from "@ventostack/core";
import type { JWTManager, RBAC } from "@ventostack/auth";
import type { EventBus } from "@ventostack/events";
import type { NotificationService } from "@ventostack/notification";
import { createAuthMiddleware, createPermMiddleware } from "./middlewares/auth-guard";
import { createLLMGateway, type LLMProvider, type LLMGateway } from "./llm-gateway";
import { createOpenAIProvider } from "./llm-gateway/providers/openai";
import { createAgentLoop, type AgentLoop } from "./agent-engine/agent-loop";
import { createKnowledgeBaseService, type KnowledgeBaseService } from "./knowledge-base/service";
import { createMemoryService, type MemoryService } from "./memory/service";
import { createKnowledgeBaseRoutes } from "./routes/knowledge-base";
import { createAgentRoutes, type AgentCrudService } from "./routes/agent";
import { createProviderRoutes } from "./routes/provider";
import { createProviderService } from "./services/provider";
import { createAgentService } from "./services/agent";
import { createChatRoutes, type ConversationService } from "./routes/chat";

export interface AIModule {
  services: {
    llmGateway: LLMGateway;
    knowledgeBase: KnowledgeBaseService;
    agentLoop: AgentLoop;
    memory: MemoryService;
  };
  router: Router;
  init(): Promise<void>;
}

export interface AIModuleDeps {
  db: unknown;
  cache?: unknown;
  jwt: JWTManager;
  jwtSecret: string;
  rbac?: RBAC;
  eventBus: EventBus;
  notification?: NotificationService;
  llmProviders?: Array<{ name: string; apiKey: string; baseUrl?: string }>;
  defaultModel?: string;
  storagePath: string;
}

export function createAIModule(deps: AIModuleDeps): AIModule {
  const { db, jwt, jwtSecret, rbac, eventBus, storagePath } = deps;

  // 创建 LLM providers（仅创建有 apiKey 的）
  const providers: LLMProvider[] = (deps.llmProviders ?? [])
    .filter((p) => !!p.apiKey)
    .map((p) => createOpenAIProvider({ apiKey: p.apiKey, baseUrl: p.baseUrl }));

  // 创建核心服务
  const llmGateway = createLLMGateway({
    providers,
    defaultModel: deps.defaultModel ?? "gpt-4o-mini",
  });

  const knowledgeBase = createKnowledgeBaseService({
    storagePath: `${storagePath}/knowledge-bases`,
    db,
  });

  const memory = createMemoryService({
    storagePath: `${storagePath}/memories`,
    db,
  });

  const agentLoop = createAgentLoop({
    llmGateway,
    knowledgeBase,
    memory,
  });

  // 创建中间件
  const authMiddleware = createAuthMiddleware(jwt, jwtSecret);
  const perm = rbac
    ? createPermMiddleware(rbac)
    : () => async (_ctx: unknown, next: () => Promise<unknown>) => next();

  // 创建路由
  const kbRouter = createKnowledgeBaseRoutes(
    knowledgeBase,
    authMiddleware,
    perm,
  );

  // Agent CRUD 服务（数据库实现）
  const providerDbService = createProviderService({ db: db as import("@ventostack/database").Database });
  const agentDbService = createAgentService({ db: db as import("@ventostack/database").Database });
  const agentCrudService: AgentCrudService = {
    create: (params) => agentDbService.create(params as Parameters<typeof agentDbService.create>[0]),
    getById: (id, tenantId) => agentDbService.getById(id, tenantId),
    list: (params) => agentDbService.list(params),
    update: (id, params, tenantId) => agentDbService.update(id, params as Parameters<typeof agentDbService.update>[1], tenantId),
    delete: (id, tenantId) => agentDbService.delete(id, tenantId),
    publish: (id, tenantId) => agentDbService.publish(id, tenantId),
  };

  const agentRouter = createAgentRoutes(
    agentCrudService,
    authMiddleware,
    perm,
  );

  // 对话服务（简化实现）
  const conversationService: ConversationService = {
    async create(params) {
      const id = crypto.randomUUID();
      return { id };
    },
    async getById(id, userId) {
      return null;
    },
    async list(params) {
      return [];
    },
    async delete(id, userId) {},
  };

  const chatRouter = createChatRoutes(
    agentLoop,
    conversationService,
    authMiddleware,
    perm,
  );

  // 合并路由
  const providerRouter = createProviderRoutes(providerDbService, authMiddleware, perm);

  const router = createRouter();
  router.merge(kbRouter);
  router.merge(agentRouter);
  router.merge(chatRouter);
  router.merge(providerRouter);

  return {
    services: {
      llmGateway,
      knowledgeBase,
      agentLoop,
      memory,
    },
    router,
    async init() {
      // 初始化逻辑（如注册事件监听）
      if (eventBus) {
        eventBus.on("ai.kb.updated", async (data: { kbId: string }) => {
          // 清除相关缓存
        });
      }
    },
  };
}

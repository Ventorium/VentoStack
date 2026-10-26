import { join } from 'node:path';
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
import { AIGatewayError } from './errors';

import type { ConfigEncryptor } from '@ventostack/core';
import type { RiskLevel } from './agent-engine/types';
import {
  APPROVAL_JUDGE_PROMPT,
  parseApprovalVerdict,
  resolveApprovalAction,
} from './approval-policy';
// LLM Gateway
import { createLLMGateway } from './llm-gateway';
import { createModelRegistry } from './llm-gateway/model-registry';
import type { ModelConfig, ModelRegistry } from './llm-gateway/model-registry';
import { createAnthropicProvider } from './llm-gateway/providers/anthropic';
import { createGoogleProvider } from './llm-gateway/providers/google';
import { createOpenAIProvider } from './llm-gateway/providers/openai';
import { createOpenAIResponsesProvider } from './llm-gateway/providers/openai-responses';
import { allowedThinkingLevels } from './llm-gateway/thinking-levels';
import type { LLMGateway, LLMProvider, RunMode } from './llm-gateway/types';

// Agent Engine
import { type AgentConfig, type AgentLoop, createAgentLoop } from './agent-engine/agent-loop';
import { createBackgroundTaskRunner, shellQuote } from './agent-engine/background-task-runner';
import type { BackgroundTaskRunner } from './agent-engine/background-task-runner';
import { type AgentEventEmitter, createEventEmitter } from './agent-engine/events';
import {
  type AgentHarness,
  type AgentHarnessOptions,
  createAgentHarness,
} from './agent-engine/harness';
import { createMcpToolSource } from './agent-engine/mcp-tool-source';
import { createRunRegistry } from './agent-engine/run-registry';
import type { RunRegistry } from './agent-engine/run-registry';
import type {
  AfterToolCallContext,
  AfterToolCallResult,
  BeforeToolCallContext,
  BeforeToolCallResult,
} from './agent-engine/types';
import { createBackgroundTaskRoutes } from './routes/background-task';
import { createBackgroundTaskService } from './services/background-task';
import type { BackgroundTask, BackgroundTaskService } from './services/background-task';
import {
  createBackgroundTaskToolCatalog,
  createBackgroundTaskTools,
} from './tools/background-task';

// Knowledge Base
import { createKnowledgeBaseService } from './knowledge-base/service';
import type { KnowledgeBaseService } from './knowledge-base/types';

import { createMemoryConsolidator } from './memory/consolidator';
// Memory
import { createMemoryService } from './memory/service';
import type { ApprovalDecisionEntry, ApprovalRequestEntry, MemoryService } from './memory/types';

// Skills
import { type SkillManager, createSkillManager } from './skills';

// Prompt Templates
import { type PromptTemplateManager, createPromptTemplateManager } from './prompt-templates';

import type { CompactionSettings } from './compaction/compaction';
// Session + Compaction
import { createLazyJsonlSessionStorage, createSession } from './session';

import { createRequire } from 'node:module';
import type { AgentRuntimeConfig, RuntimePackageBindings } from './agent-runtime/client';
import { createRuntimeSettings } from './agent-runtime/settings';
import type { RuntimeSettings } from './agent-runtime/settings';
import { createAgentRuntimeTools } from './agent-runtime/tools';
import { type AgentCrudService, createAgentRoutes } from './routes/agent';
import { type ConversationService, createChatRoutes } from './routes/chat';
import { createConnectorRoutes } from './routes/connector';
// Routes
import { createExpertRoutes } from './routes/expert';
import { createKnowledgeBaseRoutes } from './routes/knowledge-base';
import { createMcpServerRoutes } from './routes/mcp-server';
import { createProviderRoutes } from './routes/provider';
import { createRuntimeHostRoutes } from './routes/runtime-host';
import { createSkillRoutes } from './routes/skill';
import { createToolRegistryRoutes } from './routes/tool-registry';
import { createAgentService } from './services/agent';
import {
  IN_CHAT_APPROVAL_WAIT_MS,
  createApprovalService,
  createApprovalWaiter,
} from './services/approval';
import type { ApprovalWaitResult } from './services/approval';
import { createConnectorService } from './services/connector';
import type { ConnectorService } from './services/connector';
import { createExpertService } from './services/expert';
import type { ExpertService } from './services/expert';
import { createScopedKBService } from './services/kb-scope';
import { createMcpServerService } from './services/mcp-server';
import type { McpServerService } from './services/mcp-server';
import { createModelConfigService } from './services/model-config';
import { createProviderService } from './services/provider';
import { createRuntimeCapacityService } from './services/runtime-capacity';
import { createRuntimeClientRegistry } from './services/runtime-client-registry';
import type { RuntimeClientRegistry } from './services/runtime-client-registry';
import { createRuntimeHostService } from './services/runtime-host';
import { createRuntimeInstanceService } from './services/runtime-instance';
import { createRuntimeKnowledgeSyncService } from './services/runtime-kb-sync';
import { createRuntimeMemorySyncService } from './services/runtime-memory-sync';
import { createRuntimeHostMonitor } from './services/runtime-monitor';
import { createRuntimeNotifier } from './services/runtime-notifier';
import { createRuntimeWorkspaceBackupService } from './services/runtime-workspace-backup';
import { createSkillService } from './services/skill';
import { createSkillStoreService } from './services/skill-store';
import type { SkillStoreService } from './services/skill-store';
import { createSessionService } from './session-service';
import type { SessionService } from './session-service';
import { createToolRegistry } from './tool-registry';
import type { ToolDefinition, ToolRegistry } from './tool-registry';
import {
  createBase64Tool,
  createCalculatorTool,
  createDatetimeTool,
  createFileReadTool,
  createFileWriteTool,
  createHashTool,
  createJsonFormatTool,
  createKBBrowseTool,
  createKBFollowLinkTool,
  createKBOutlineTool,
  createKBReadTool,
  createKBSearchTool,
  createReadDocumentTool,
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
    expertService: ExpertService;
    modelConfigService: ModelConfigService;
    scopedKBService: ScopedKBService;
    mcpServerService: McpServerService;
    connectorService: ConnectorService;
    /** 会话统一入口（JSONL 为准 + ai_session_meta 投影）：渠道/定时任务等复用 */
    sessionService: SessionService;
    /** 请求级工具注册表工厂：渠道侧运行 Agent 时复用同一套租户工具 */
    createToolRegistry(
      tenantId: string,
      userId?: string,
      sessionId?: string,
    ): Promise<ToolRegistry>;
    /** Agent 读取（渠道通知摘要要取 summaryModel） */
    agentCrud: AgentCrudService;
    /** 虚拟机宿主管理 */
    runtimeHosts: ReturnType<typeof createRuntimeHostService>;
    /** 虚拟机实例生命周期 */
    runtimeInstances: ReturnType<typeof createRuntimeInstanceService>;
    /** 虚拟机资源可用性 */
    runtimeCapacity: ReturnType<typeof createRuntimeCapacityService>;
    /** 知识库 VM 同步 */
    runtimeKbSync: ReturnType<typeof createRuntimeKnowledgeSyncService>;
    /** 工作区备份 */
    runtimeWorkspaceBackup: ReturnType<typeof createRuntimeWorkspaceBackupService>;
    /** 后台任务台账（脚本任务/定时唤醒） */
    backgroundTasks: BackgroundTaskService;
    /** 后台任务调度运行时 */
    backgroundTaskRunner: BackgroundTaskRunner;
    /** 会话运行租约（Web 对话 / 渠道 / 后台触发共用） */
    runRegistry: RunRegistry;
  };
  router: Router;
  /** 创建 Agent Harness 实例 */
  createHarness(options: Partial<AgentHarnessOptions>): AgentHarness;
  init(): Promise<void>;
  shutdown?(): Promise<void>;
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
  /** 专家数据目录（磁盘权威存储）；默认 ${storagePath}/experts，生产 /app/data/experts */
  expertDataDir?: string;
  /** ExpertHub 地址；默认 CloudSmith 公开前缀 */
  expertHubBaseUrl?: string;
  /** ExpertHub manifest 签名公钥（ed25519 hex）；配置后强制校验 manifest.sig */
  expertHubSigningPubkey?: string;
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
    ) =>
      | Promise<import('./llm-gateway/types').ChatMessage[]>
      | import('./llm-gateway/types').ChatMessage[];
    prepareNextTurn?: (
      context: import('./agent-engine/types').PrepareNextTurnContext,
      signal?: AbortSignal,
    ) =>
      | Promise<import('./agent-engine/types').AgentLoopTurnUpdate | undefined>
      | import('./agent-engine/types').AgentLoopTurnUpdate
      | undefined;
    getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
    dynamicToolResolver?: (
      toolName: string,
      tenantId: string,
    ) =>
      | Promise<import('./agent-engine/types').AgentTool | undefined>
      | import('./agent-engine/types').AgentTool
      | undefined;
  };
  /** 压缩设置 */
  compactionSettings?: CompactionSettings;
  /** 动态 system prompt */
  systemPrompt?: AgentHarnessOptions['systemPrompt'];
  /** 分布式追踪器（@ventostack/observability）；提供时自动埋 AI span */
  tracer?: import('@ventostack/observability').Tracer;
  /** 父 span 上下文 */
  parentSpanContext?: { traceId: string; spanId: string };
  /** 独立 Firecracker runtime；未配置时普通 Agent 仍可工作。 */
  agentRuntime?: AgentRuntimeConfig;
  /** 平台管理员实时校验中间件（由 platform/system 注入；缺失时宿主管理 fail-closed） */
  platformAdminMiddleware?: Middleware;
  /** 平台管理员站内信（30 天闲置提醒）；缺失时只记录日志 */
  notifyPlatformAdmins?: (params: {
    tenantId: string;
    title: string;
    content: string;
  }) => Promise<void>;
  /** 运行时参数覆盖（测试/部署） */
  runtimeSettings?: Partial<RuntimeSettings>;
  /** 原生 vm-runtime 绑定（测试可注入；缺省从 @ventostack/vm-runtime 加载） */
  runtimeBindings?: RuntimePackageBindings;
  /**
   * 对外可访问的基础地址（如 https://ai.example.com）。
   * 用于生成 MCP / 渠道等需要回填到第三方的回调地址。
   */
  publicBaseUrl?: string;
  /**
   * 请求级扩展工具工厂（渠道通知等由平台层注入）。
   * 是否返回工具取决于会话级设置（如「渠道通知」开关），因此必须异步。
   */
  extraTools?: (params: {
    tenantId: string;
    userId: string;
    sessionId?: string;
  }) => Promise<ToolDefinition[]>;
  /**
   * 一轮对话结束后的钩子（渠道自动推送等）。
   * finalContent 为本轮最后一次完整 assistant 回复，供通知子智能体总结后发送。
   */
  onRunFinished?: (params: {
    sessionId: string;
    agentId: string;
    tenantId: string;
    userId: string;
    finalContent: string;
  }) => Promise<void>;
  /** 后台任务（脚本/定时唤醒）运行参数覆盖（测试/部署） */
  backgroundTasks?: {
    tickIntervalMs?: number;
    maxActiveTasksPerUser?: number;
    maxTriggerPerTick?: number;
    maxScriptsPerTick?: number;
    turnTimeoutMs?: number;
  };
}

// ---- Provider 创建 ----

/** 从 agent 的 config JSON 中提取深度研究配置（存在 research 字段时返回） */
function extractResearch(
  config: unknown,
): { research: AgentConfig['research'] } | Record<string, never> {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return {};
  const research = (config as Record<string, unknown>).research;
  if (!research || typeof research !== 'object' || Array.isArray(research)) return {};
  const depth = (research as Record<string, unknown>).depth;
  if (depth === 'quick' || depth === 'normal' || depth === 'deep') {
    // 透传自定义预算字段（创建 Agent 时可按需覆盖深度预设；非法值忽略）
    const raw = research as Record<string, unknown>;
    const out: AgentConfig['research'] = { depth };
    for (const key of [
      'maxIterations',
      'maxTokensPerTurn',
      'searchCount',
      'maxSubtasks',
      'maxSubtaskTurns',
    ] as const) {
      const value = raw[key];
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        out[key] = value;
      }
    }
    return { research: out };
  }
  return {};
}

/** 从 agent 的 config JSON 中提取会话总结模型、审批模型与默认思考强度 */
function extractAgentConfigExtras(
  config: unknown,
): Pick<AgentConfig, 'summaryModel' | 'approvalModel' | 'defaultThinkingLevel' | 'sourceExpert'> {
  const out: Pick<
    AgentConfig,
    'summaryModel' | 'approvalModel' | 'defaultThinkingLevel' | 'sourceExpert'
  > = {};
  if (!config || typeof config !== 'object' || Array.isArray(config)) return out;
  const raw = config as Record<string, unknown>;
  const modelRef = (value: unknown): string | undefined =>
    typeof value === 'string' && value.length > 0 && value.length <= 64 ? value : undefined;
  const summaryModel = modelRef(raw.summaryModel);
  if (summaryModel) out.summaryModel = summaryModel;
  const approvalModel = modelRef(raw.approvalModel);
  if (approvalModel) out.approvalModel = approvalModel;
  const sourceExpert = modelRef(raw.sourceExpert);
  if (sourceExpert) out.sourceExpert = sourceExpert;
  const thinking = raw.defaultThinkingLevel;
  if (
    typeof thinking === 'string' &&
    ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(thinking)
  ) {
    out.defaultThinkingLevel = thinking as AgentConfig['defaultThinkingLevel'];
  }
  return out;
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
  const apiFormat =
    config.apiFormat ??
    (config.name === 'anthropic'
      ? 'anthropic'
      : config.name === 'google'
        ? 'google'
        : 'openai_chat');
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
  const { db, authMiddleware, eventBus, storagePath, cache } = deps;
  const runtimeSettings = createRuntimeSettings({ storagePath, ...(deps.runtimeSettings ?? {}) });
  let runtimeBindings: RuntimePackageBindings | undefined = deps.runtimeBindings;
  if (!runtimeBindings) {
    try {
      const bindings = createRequire(import.meta.url)('@ventostack/vm-runtime') as {
        requestRuntime: RuntimePackageBindings['request'];
        requestRuntimeBinary: RuntimePackageBindings['requestBinary'];
      };
      runtimeBindings = {
        request: bindings.requestRuntime,
        requestBinary: bindings.requestRuntimeBinary,
      };
    } catch (error) {
      console.warn('[ai] @ventostack/vm-runtime 未加载，虚拟机宿主管理不可用:', error);
    }
  }

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
  // 审批等待器：在 SSE 流内挂起等待 decision（聊天内自确认，含其他已登录标签页发起的确认）
  const waitForApproval = createApprovalWaiter({
    getStatus: (id) => approvalService.getStatus(id),
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
      // 空模型（Agent 未配置模型）与 'default' 同样回退到默认模型；
      // gateway 在 defaultModel 未配置时会把 'default' 替换为 undefined 传入，此处必须一并兜底
      if (!effectiveModel || effectiveModel === 'default') {
        // 双轨对齐：优先读取前端设置页写入的 default_model，兼容历史 model_purpose_default_chat
        effectiveModel =
          (await providerService.getConfig('default_model')) ??
          (await providerService.getConfig('model_purpose_default_chat')) ??
          '';
      }
      if (!effectiveModel) return null;
      const runtime = await providerService.resolveRuntimeModel(
        effectiveModel,
        tenantId || 'default',
      );
      if (!runtime) return null;
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

  // 创建虚拟机运行时服务（宿主池 / 容量 / 实例 / 同步）
  const runtimeDb = db as import('@ventostack/database').Database;
  const runtimeHostService = createRuntimeHostService({
    db: runtimeDb,
    encryptor: deps.credentialEncryptor,
    settings: runtimeSettings,
  });
  const runtimeCapacity = createRuntimeCapacityService({
    db: runtimeDb,
    hostService: runtimeHostService,
    settings: runtimeSettings,
  });
  const runtimeClients: RuntimeClientRegistry = runtimeBindings
    ? createRuntimeClientRegistry({
        hostService: runtimeHostService,
        bindings: runtimeBindings,
        timeoutMs: deps.agentRuntime?.timeoutMs ?? 30_000,
      })
    : {
        async get() {
          throw Object.assign(new Error('@ventostack/vm-runtime 未安装或加载失败'), {
            code: 'AGENT_RUNTIME_UNAVAILABLE',
            status: 503,
          });
        },
        invalidate() {},
        clear() {},
      };
  const runtimeWorkspaceBackup = createRuntimeWorkspaceBackupService({
    db: runtimeDb,
    settings: runtimeSettings,
  });
  const runtimeKbSync = createRuntimeKnowledgeSyncService({
    db: runtimeDb,
    kbService: knowledgeBase,
    storagePath,
  });
  const runtimeMemorySync = createRuntimeMemorySyncService({
    db: runtimeDb,
    memory,
  });
  const runtimeInstances = createRuntimeInstanceService({
    db: runtimeDb,
    settings: runtimeSettings,
    hostService: runtimeHostService,
    capacity: runtimeCapacity,
    clients: runtimeClients,
    workspaceBackup: runtimeWorkspaceBackup,
  });
  const runtimeMonitor = createRuntimeHostMonitor({
    db: runtimeDb,
    settings: runtimeSettings,
    hostService: runtimeHostService,
    instanceService: runtimeInstances,
    clients: runtimeClients,
  });
  const runtimeNotifier = createRuntimeNotifier({
    db: runtimeDb,
    settings: runtimeSettings,
    instanceService: runtimeInstances,
    ...(deps.notification ? { notification: deps.notification } : {}),
    ...(deps.notifyPlatformAdmins ? { notifyPlatformAdmins: deps.notifyPlatformAdmins } : {}),
  });
  /** 读取后台脚本日志尾部（后台任务详情接口/工具用） */
  async function readBackgroundTaskLog(task: BackgroundTask): Promise<string | null> {
    if (!task.instanceId || !task.sandboxId || !task.execLogPath) return null;
    try {
      const instance = await runtimeInstances.getById(task.instanceId);
      if (!instance?.sandboxId) return null;
      const client = await runtimeClients.get(instance.hostId);
      const result = await client.runCommand(
        task.sandboxId,
        ['sh', '-lc', `tail -c 20000 ${shellQuote(task.execLogPath)}`],
        { timeoutMs: 15_000 },
      );
      return result.stdout || null;
    } catch {
      return null;
    }
  }

  const runtimeBackupTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let runtimeNotifierTimer: ReturnType<typeof setInterval> | null = null;
  let runtimeWorkspaceBackupTimer: ReturnType<typeof setInterval> | null = null;
  let runtimeWorkspaceBackupRunning = false;
  function scheduleWorkspaceBackup(
    instance: {
      id: string;
      tenantId: string;
      userId: string;
      agentId: string;
      sandboxId: string | null;
    },
    client: import('./agent-runtime/types').AgentRuntimeClient,
  ): void {
    if (!instance.sandboxId) return;
    const existing = runtimeBackupTimers.get(instance.id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      runtimeBackupTimers.delete(instance.id);
      void runtimeWorkspaceBackup
        .syncInstance(
          {
            id: instance.id,
            tenantId: instance.tenantId,
            userId: instance.userId,
            agentId: instance.agentId,
            sandboxId: instance.sandboxId!,
          },
          client,
        )
        .catch((error) => {
          console.warn('[ai] 工作区增量备份失败（不阻断对话）:', error);
        });
    }, 2_000);
    (timer as unknown as { unref?: () => void }).unref?.();
    runtimeBackupTimers.set(instance.id, timer);
  }

  const kbSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();
  function scheduleKbSync(event: {
    tenantId: string;
    kbId: string;
    op: string;
    path?: string;
  }): void {
    if (!event.tenantId || !event.kbId) return;
    const key = `${event.tenantId}:${event.kbId}`;
    const existing = kbSyncTimers.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      kbSyncTimers.delete(key);
      void (async () => {
        const sessions = await runtimeKbSync.listSessionsForKb(event.tenantId, event.kbId);
        for (const session of sessions) {
          try {
            const instance = await runtimeInstances.getById(session.instanceId);
            if (!instance?.sandboxId) continue;
            if (instance.state === 'paused' || instance.state === 'stopped') {
              await runtimeKbSync.markDirty(event.tenantId, session.sessionId);
              continue;
            }
            const kbIds =
              event.op === 'deleted'
                ? session.boundKbIds.filter((id) => id !== event.kbId)
                : session.boundKbIds;
            const client = await runtimeClients.get(instance.hostId);
            await runtimeKbSync.syncSession({
              tenantId: event.tenantId,
              userId: instance.userId,
              agentId: instance.agentId,
              sessionId: session.sessionId,
              kbIds,
              instance: {
                id: instance.id,
                sandboxId: instance.sandboxId,
                tenantId: instance.tenantId,
              },
              client,
            });
          } catch (error) {
            console.warn('[ai] 知识库增量同步失败，已标记待重试:', error);
            await runtimeKbSync.markDirty(event.tenantId, session.sessionId).catch(() => undefined);
          }
        }
      })().catch((error) => {
        console.warn('[ai] 知识库增量同步任务失败:', error);
      });
    }, 300);
    (timer as unknown as { unref?: () => void }).unref?.();
    kbSyncTimers.set(key, timer);
  }

  /**
   * 审批台账：把审批生命周期写回会话 JSONL（custom 条目，不进 LLM 上下文）。
   * 目的：审批不再只活在 SSE 流里——刷新页面后前端靠台账还原待审批弹窗与历史决议。
   * 台账写失败不影响审批主流程（会话可能已被删除或磁盘异常）。
   */
  async function appendApprovalJournal(
    scope: { tenantId: string; userId: string },
    sessionId: string,
    customType: 'approval_request' | 'approval_decision',
    data: ApprovalRequestEntry | ApprovalDecisionEntry,
  ): Promise<void> {
    await memory.appendCustomEntry(sessionId, scope, customType, data).catch(() => {});
  }

  /** 决议事件 → 台账：决议可能来自聊天自确认、管理员审批或超时过期，统一在此落账 */
  async function journalApprovalDecision(
    payload: unknown,
    status: ApprovalDecisionEntry['status'],
  ): Promise<void> {
    const event = payload as
      | {
          id?: string;
          sessionId?: string | null;
          tenantId?: string;
          requestedBy?: string;
          reviewedBy?: string | null;
          reason?: string | null;
        }
      | undefined;
    if (!event?.id || !event.sessionId || !event.requestedBy) return;
    await appendApprovalJournal(
      { tenantId: event.tenantId ?? 'default', userId: event.requestedBy },
      event.sessionId,
      'approval_decision',
      {
        id: event.id,
        status,
        ...(event.reason ? { reason: event.reason } : {}),
        ...(event.reviewedBy ? { decidedBy: event.reviewedBy } : {}),
        decidedAt: new Date().toISOString(),
      },
    );
  }
  eventBus.on({ name: 'ai.approval.approved' }, (payload) => {
    void journalApprovalDecision(payload, 'approved');
  });
  eventBus.on({ name: 'ai.approval.rejected' }, (payload) => {
    void journalApprovalDecision(payload, 'rejected');
  });
  eventBus.on({ name: 'ai.approval.expired' }, (payload) => {
    void journalApprovalDecision(payload, 'expired');
  });

  /**
   * 等待审批 + 超时/停止收尾：等待窗口结束（超时）或本次运行被显式停止时，
   * 把审批单落为过期（默认拒绝/未执行），由事件订阅统一记一条决议台账——
   * 否则刷新页面会看到一个已经不可能执行的待审批弹窗。
   */
  const waitForApprovalWithExpiry = async (
    request: { id: string; expiresAt: string },
    signal?: AbortSignal,
  ): Promise<ApprovalWaitResult> => {
    const result = await waitForApproval(request, signal);
    if (result.status === 'expired') {
      await approvalService.expire(request.id, result.reason).catch(() => null);
    }
    return result;
  };

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

  /**
   * 内置工具注册表（同步）。
   * KB 等租户相关工具按租户绑定：对话路由按请求 tenantId 构建请求级注册表
   * （见 createChatRoutes options），默认注册表供工具发现/管理路由使用。
   */
  // 后台任务服务在装配后半段创建（依赖 db/session/memory）；工具注册表按请求懒取，
  // 因此用 ref 占位避免「先建注册表、后建服务」的顺序问题。
  let backgroundTaskServiceRef: BackgroundTaskService | null = null;
  let sessionServiceRef: SessionService | null = null;

  function buildBaseToolRegistry(
    tenantId: string,
    userId?: string,
    sessionId?: string,
  ): ToolRegistry {
    // 防御性校验：tenantId 会拼进文件工具的 allowedPaths，
    // 含路径分隔符或 ../ 的异常值会移动基准目录造成跨租户读写（fail-closed）
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(tenantId)) {
      throw new Error(`Invalid tenantId for tool registry: ${tenantId}`);
    }
    for (const [field, value] of [
      ['userId', userId],
      ['sessionId', sessionId],
    ] as const) {
      if (value !== undefined && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) {
        throw new Error(`Invalid ${field} for tool registry`);
      }
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
    if (userId && sessionId) {
      registry.register({
        name: 'memory-candidate',
        description: '记录会影响当前会话后续回答或执行的候选记忆。不要记录普通对话摘要。',
        parameters: [
          {
            name: 'type',
            type: 'string',
            description: 'concern/hypothesis/correction/decision/constraint/preference/observation',
            required: true,
          },
          {
            name: 'content',
            type: 'string',
            description: '有明确证据的简洁记忆内容',
            required: true,
          },
          {
            name: 'sourceMessageIds',
            type: 'array',
            description: '来源消息 ID，可为空',
            required: false,
            schema: { items: { type: 'string' }, maxItems: 20 },
          },
        ],
        riskLevel: 'low',
        async handler(params) {
          const type = String(params.type);
          const allowed = [
            'concern',
            'hypothesis',
            'correction',
            'decision',
            'constraint',
            'preference',
            'observation',
          ] as const;
          if (!allowed.includes(type as (typeof allowed)[number]))
            return { error: '不支持的记忆事件类型' };
          return memory.appendMemoryEvent(
            sessionId,
            { tenantId, userId },
            {
              type: type as (typeof allowed)[number],
              content: String(params.content ?? ''),
              sourceMessageIds: Array.isArray(params.sourceMessageIds)
                ? params.sourceMessageIds.filter((id): id is string => typeof id === 'string')
                : [],
            },
          );
        },
      });
    }
    // 后台任务工具：让 Agent 自己布置/查询/取消长任务与定时唤醒。
    // 需要会话上下文（任务归属到 user+session），且服务已装配。
    if (userId && sessionId && backgroundTaskServiceRef) {
      const backgroundTasks = backgroundTaskServiceRef;
      const tools = createBackgroundTaskTools({
        tasks: backgroundTasks,
        scope: { tenantId, userId, sessionId },
        ...(deps.backgroundTasks?.maxActiveTasksPerUser === undefined
          ? {}
          : { maxActiveTasksPerUser: deps.backgroundTasks.maxActiveTasksPerUser }),
        async resolveAgent() {
          const view = await sessionServiceRef?.get(sessionId, { tenantId, userId });
          if (!view) return null;
          const agent = (await agentCrudService.getById(
            view.agentId,
            tenantId,
          )) as AgentConfig | null;
          if (!agent) return null;
          return {
            agentId: view.agentId,
            requiresVirtualEnvironment: agent.requiresVirtualEnvironment === true,
          };
        },
        readLog: (task) => readBackgroundTaskLog(task),
      });
      for (const tool of tools) registry.register(tool);
    }

    if (runtimeBindings) {
      registry.register({
        name: 'terminal',
        description: '在 Agent 的隔离 Linux 虚拟环境中执行命令。',
        parameters: [{ name: 'command', type: 'array', description: '命令及参数', required: true }],
        riskLevel: 'high',
        requiresApproval: true,
        async handler() {
          return { error: '当前 Agent 未绑定虚拟环境' };
        },
      });
    }

    // 知识库工具（tenantId 为请求级租户标识：memory 隔离、skill/KB 归属、审计）
    registry.register(createKBBrowseTool({ kbService: knowledgeBase, tenantId }));
    registry.register(createKBReadTool({ kbService: knowledgeBase, tenantId }));
    registry.register(createKBSearchTool({ kbService: knowledgeBase, tenantId }));
    registry.register(createKBFollowLinkTool({ kbService: knowledgeBase, tenantId }));
    registry.register(createKBOutlineTool({ kbService: knowledgeBase, tenantId }));

    // 知识库文件浏览由 kb-* 工具承担；不提供 ls/cat/grep 等重复工具（避免与 kb-* 职责重叠）

    // 文件读写工具（租户作用域：仅允许访问本租户目录，防止跨租户文件读取/写入）
    const artifactRoot =
      userId && sessionId
        ? join(
            storagePath,
            'memories',
            tenantId,
            'users',
            userId,
            'sessions',
            sessionId,
            'artifacts',
          )
        : join(storagePath, 'memories', tenantId);
    registry.register(createFileReadTool({ allowedPaths: [artifactRoot], rootPath: artifactRoot }));
    registry.register(
      createFileWriteTool({ allowedPaths: [artifactRoot], rootPath: artifactRoot }),
    );
    if (userId && sessionId) registry.register(createReadDocumentTool({ rootPath: artifactRoot }));

    return registry;
  }

  /**
   * 请求级工具注册表：内置工具 + 平台注入的扩展工具。
   *
   * 必须异步：扩展工具是否出现取决于会话级设置（如「渠道通知」开关，需查库），
   * 若强行同步只能「永远注册、handler 内报错」——模型会看到一个总失败的工具，
   * 白烧 token 且体验差。
   */
  async function buildToolRegistry(
    tenantId: string,
    userId?: string,
    sessionId?: string,
  ): Promise<ToolRegistry> {
    const registry = buildBaseToolRegistry(tenantId, userId, sessionId);
    if (!deps.extraTools) return registry;
    try {
      const extra = await deps.extraTools({ tenantId, userId: userId ?? '', sessionId });
      for (const tool of extra) {
        if (!registry.get(tool.name)) registry.register(tool);
      }
    } catch (error) {
      // 扩展工具故障不能让整轮对话不可用：降级为「本轮没有这些工具」
      console.error('[ai] 加载扩展工具失败（本轮降级）:', error);
    }
    return registry;
  }

  // 默认租户注册表（供工具发现/管理路由；对话按请求 tenantId 另行构建）
  const toolRegistry = buildBaseToolRegistry('default');

  // Agent CRUD 服务（先创建，供 AgentLoop 使用）
  const agentDbService = createAgentService({
    db: db as import('@ventostack/database').Database,
    async assertCanEnable(tenantId, userId) {
      await runtimeCapacity.assertCanEnable(tenantId, userId);
    },
    async onBeforeDelete(agentId, tenantId) {
      await runtimeInstances.destroyByAgent(tenantId, agentId);
    },
    // 依赖引用校验：model / 知识库 / Skill / MCP 引用必须有效且归属当前租户
    validateRefs: async (params, tenantId) => {
      const tid = tenantId || 'default';
      for (const modelRef of params.model ?? []) {
        if (modelRef === 'default') continue;
        const inRegistry = modelRegistry.has(modelRef);
        let runtime = null;
        if (!inRegistry) {
          try {
            runtime = await providerService.resolveRuntimeModel(modelRef, tid);
          } catch {
            runtime = null;
          }
        }
        if (!inRegistry && !runtime) {
          throw new AIGatewayError(`模型 ${modelRef} 未配置或不可用`, 400, 'AI_MODEL_NOT_FOUND');
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
          models: item.model,
          ...(Array.isArray(item.tools) ? { tools: item.tools as string[] } : {}),
          ...(Array.isArray(item.knowledgeBaseIds)
            ? { knowledgeBaseIds: item.knowledgeBaseIds as string[] }
            : {}),
          ...(Array.isArray(item.skillIds) ? { skillIds: item.skillIds as string[] } : {}),
          ...(Array.isArray(item.mcpServerIds)
            ? { mcpServerIds: item.mcpServerIds as string[] }
            : {}),
          ...(typeof item.maxIterations === 'number' ? { maxIterations: item.maxIterations } : {}),
          ...(typeof item.maxTokensPerTurn === 'number'
            ? { maxTokensPerTurn: item.maxTokensPerTurn }
            : {}),
          ...(item.memoryConfig ? { memoryConfig: item.memoryConfig } : {}),
          ...extractResearch(item.config),
          ...extractAgentConfigExtras(item.config),
          tenantId: item.tenantId,
          requiresVirtualEnvironment: item.requiresVirtualEnvironment,
          networkEnabled: item.networkEnabled !== false,
          // 采集开关随详情一并返回，编辑弹窗据此回填（默认关闭）
          contextCollectionEnabled: item.contextCollectionEnabled ?? false,
          ...(item.sandboxStatus ? { sandboxStatus: item.sandboxStatus } : {}),
        };
      }),
    list: async (params) => {
      const result = await agentDbService.list(params);
      return {
        total: result.total,
        list: result.list.map(({ sandboxId: _sandboxId, ...item }) => item),
      };
    },
    update: (id, params, tenantId, opts) =>
      agentDbService.update(
        id,
        params as Parameters<typeof agentDbService.update>[1],
        tenantId,
        opts,
      ),
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
  // 连接器服务先声明（let），在 mcpServerService 之后赋值；
  // authHeadersProvider 闭包在运行时（出站调用时）才解析 connectorService，避免构造期 TDZ/循环。
  let connectorService: import('./services/connector').ConnectorService;
  const mcpServerService = createMcpServerService({
    db: db as import('@ventostack/database').Database,
    allowedStdioCommands: allowedMcpCommands,
    allowedHttpHosts: allowedMcpHosts,
    credentialEncryptor: deps.credentialEncryptor,
    authHeadersProvider: (server) =>
      connectorService.resolveAuthHeaders(server.id, server.tenantId),
  });

  // 连接器服务：目录 + 授权 + 托管 MCP
  connectorService = createConnectorService({
    db: db as import('@ventostack/database').Database,
    mcpServerService,
    credentialEncryptor: deps.credentialEncryptor,
    ...(cache !== undefined
      ? {
          stateStore: {
            get: (key: string) => (cache as import('@ventostack/cache').Cache).get<string>(key),
            set: (key: string, value: string, ttl: number) =>
              (cache as import('@ventostack/cache').Cache).set(key, value, { ttl }),
            delete: (key: string) => (cache as import('@ventostack/cache').Cache).del(key),
          },
        }
      : {}),
    ...(deps.publicBaseUrl ? { publicBaseUrl: deps.publicBaseUrl } : {}),
  });
  const mcpToolSource = createMcpToolSource(mcpServerService);

  // 创建 Agent Loop
  const consolidateMemory = createMemoryConsolidator({ memory, llmGateway });
  const activeMemoryJobs = new Set<string>();
  const rerunMemoryJobs = new Set<string>();
  const scheduleMemoryConsolidation = async (params: {
    sessionId: string;
    tenantId: string;
    userId: string;
    model?: string;
  }): Promise<void> => {
    const scope = { tenantId: params.tenantId, userId: params.userId };
    await memory.setMemoryConsolidationStatus(params.sessionId, scope, 'pending');
    if (activeMemoryJobs.has(params.sessionId)) {
      rerunMemoryJobs.add(params.sessionId);
      return;
    }
    activeMemoryJobs.add(params.sessionId);
    queueMicrotask(async () => {
      try {
        do {
          rerunMemoryJobs.delete(params.sessionId);
          await consolidateMemory({
            sessionId: params.sessionId,
            scope,
            model: params.model ?? deps.defaultModel,
          });
        } while (rerunMemoryJobs.has(params.sessionId));
      } finally {
        activeMemoryJobs.delete(params.sessionId);
      }
    });
  };
  queueMicrotask(async () => {
    const pending = await memory.listPendingMemoryConsolidations().catch(() => []);
    for (const item of pending) {
      await scheduleMemoryConsolidation({ sessionId: item.sessionId, ...item.scope }).catch(
        () => undefined,
      );
    }
  });
  /**
   * 审批子智能体：判定一次工具调用能否放行。
   * 任何失败（未配置模型 / 调用异常 / 输出非法）都返回 null，由调用方 fail-closed 转人工审批——
   * 绝不因为"判不出来"而放行。
   */
  async function judgeToolCall(params: {
    agentId: string;
    tenantId: string;
    toolName: string;
    toolDescription?: string;
    riskLevel: RiskLevel;
    input: Record<string, unknown>;
  }): Promise<{ decision: 'approve' | 'reject'; reason: string } | null> {
    try {
      const agent = await agentCrudService.getById(params.agentId, params.tenantId);
      const model = agent?.approvalModel ?? agent?.summaryModel ?? agent?.models?.[0];
      if (!model) return null;
      const result = await llmGateway.chat({
        model,
        tenantId: params.tenantId,
        // 审批判定是短判断任务：关掉思考，避免推理模型耗尽预算后返回空 content
        thinkingLevel: 'off',
        maxTokens: 1024,
        messages: [
          { role: 'system', content: APPROVAL_JUDGE_PROMPT },
          {
            role: 'user',
            content: JSON.stringify({
              tool: params.toolName,
              description: params.toolDescription ?? '',
              riskLevel: params.riskLevel,
              arguments: params.input,
            }),
          },
        ],
      });
      // 部分网关（如自建 vLLM）无视 enable_thinking，思考仍占满预算导致 content 为空；
      // 此时退回 reasoning 文本里最后一段合法判定。两处都没有 → null → fail-closed 转人工
      return parseApprovalVerdict(result.content) ?? parseApprovalVerdict(result.reasoning ?? '');
    } catch (err) {
      console.error('[ai] 审批子智能体判定失败，转人工审批:', err);
      return null;
    }
  }

  // Expert 服务（数据目录独立于 storagePath 约定：专用卷 /app/data/experts；须在 agentLoop 之前创建供 resolveExpert 闭包引用）
  const expertService = createExpertService({
    db,
    eventBus,
    dataDir: deps.expertDataDir ?? `${storagePath}/experts`,
    ...(deps.expertHubBaseUrl ? { hubBaseUrl: deps.expertHubBaseUrl } : {}),
    ...(deps.expertHubSigningPubkey ? { hubSigningPubkey: deps.expertHubSigningPubkey } : {}),
    // 一键实例化：闭包引用后置创建的 modelConfigService（请求期才执行，无时序问题）
    agentFactory: (params) =>
      agentDbService.create(params as Parameters<typeof agentDbService.create>[0]),
    resolveDefaultModel: () => modelConfigService.get('default_chat'),
  });

  // 团队委派子运行对 agentLoop 的惰性引用：deps 闭包先于 agentLoop 完成创建，
  // 首次委派发生在请求期，届时引用必然已赋值。
  let agentLoopRef: AgentLoop | null = null;

  /** VM Agent 运行时准备：确保实例、同步知识库/记忆、构建提示词与工具。 */
  async function prepareAgentRuntime(params: {
    agentId: string;
    tenantId: string;
    userId: string;
    sessionId: string;
    knowledgeBaseIds: string[];
    agentConfig: AgentConfig;
  }): Promise<{
    instanceId: string;
    sandboxId: string;
    promptBlock: string;
    tools: import('./agent-engine/types').AgentTool[];
  }> {
    const rawResources = (
      params.agentConfig as unknown as {
        config?: {
          runtime?: { resources?: Partial<import('./agent-runtime/types').RuntimeResources> };
        };
      }
    ).config?.runtime?.resources;
    const ensured = await runtimeInstances.ensure({
      tenantId: params.tenantId,
      userId: params.userId,
      agentId: params.agentId,
      ...(params.agentConfig.networkEnabled === undefined
        ? {}
        : { networkEnabled: params.agentConfig.networkEnabled }),
      ...(rawResources
        ? {
            resources: {
              ...runtimeSettings.defaultResources,
              ...rawResources,
            },
          }
        : {}),
    });
    const { instance, client } = ensured;
    if (!instance.sandboxId) throw new Error('虚拟机实例尚未就绪');
    await client
      .runCommand(instance.sandboxId, ['mkdir', '-p', `/workspace/${params.sessionId}/outputs`], {
        cwd: '/workspace',
        timeoutMs: 15_000,
      })
      .catch((error) => console.warn('[ai] 创建会话输出目录失败（不阻断对话）:', error));

    try {
      await runtimeKbSync.syncSession({
        tenantId: params.tenantId,
        userId: params.userId,
        agentId: params.agentId,
        sessionId: params.sessionId,
        kbIds: params.knowledgeBaseIds,
        instance: {
          id: instance.id,
          sandboxId: instance.sandboxId,
          tenantId: instance.tenantId,
        },
        client,
      });
    } catch (error) {
      await runtimeKbSync.markDirty(params.tenantId, params.sessionId).catch(() => undefined);
      throw Object.assign(
        new Error(`知识库同步失败：${error instanceof Error ? error.message : String(error)}`),
        { code: 'KB_SYNC_FAILED', status: 503 },
      );
    }

    await runtimeMemorySync
      .syncSessionMemory({
        tenantId: params.tenantId,
        userId: params.userId,
        sessionId: params.sessionId,
        instance: { id: instance.id, sandboxId: instance.sandboxId, tenantId: instance.tenantId },
        client,
      })
      .catch((error) => console.warn('[ai] 会话记忆同步失败（不阻断对话）:', error));
    await runtimeMemorySync
      .pullGlobal({
        tenantId: params.tenantId,
        userId: params.userId,
        instance: { id: instance.id, sandboxId: instance.sandboxId, tenantId: instance.tenantId },
        client,
      })
      .catch((error) => console.warn('[ai] 全局记忆拉取失败（不阻断对话）:', error));

    const kbBlock = await runtimeKbSync.buildPromptBlock({
      tenantId: params.tenantId,
      sessionId: params.sessionId,
      kbIds: params.knowledgeBaseIds,
    });
    const networkEnabled = params.agentConfig.networkEnabled !== false;
    const promptBlock = [
      '## 运行环境',
      '你运行在一台隔离的 Linux 机器中，工作目录 /workspace（持久保存，跨会话保留）。',
      '基础镜像是 Debian 最小镜像，已预装 rg（ripgrep）和 curl；其余使用系统自带命令（bash/sh、grep、find、cat、sed、awk、head、tail、sort、uniq、xargs、tar 等）。',
      networkEnabled
        ? '当前环境已允许出网，可用 curl 访问外部 HTTP/HTTPS；不要依赖 apt/pip/npm 安装系统级软件。'
        : '当前环境未启用外网，不能访问外部网络或安装新软件，请用现有命令完成任务。',
      '探索文件时优先使用 rg，阅读用 cat / sed / head / tail；不要假设文件存在。',
      '',
      kbBlock,
      '',
      '## 工作方式',
      '- 直接用 terminal 探索和操作；需要交付的 PPT/Excel/Word/PDF/图片/代码等文件写入 `/workspace/${params.sessionId}/outputs`。',
      `- 不要修改 /workspace/${params.sessionId}/knowledges 与 /workspace/${params.sessionId}/memories；不要访问其他会话目录。`,
      '- 会话记忆由系统维护；需要记录候选事实时使用 memory-candidate。',
      '- 长期有效的偏好、结论、项目背景写入 /root/.vento-agent/memories/<主题>.md，使用 Markdown 标题。',
      '- 命令输出过长时用 head/tail/rg -l 等收敛，避免一次读入超大文件。',
      '- 运行中的服务/构建使用 background 参数，日志写入 /workspace/.agent-logs。',
    ].join('\n');

    const selected = new Set(params.agentConfig.tools ?? []);
    const tools = createAgentRuntimeTools(client, instance.sandboxId, {
      workspace: '/workspace',
      readRoots: ['/workspace', '/root/.vento-agent'],
      writeRoots: ['/workspace', '/root/.vento-agent'],
      protectedWritePrefixes: [
        `/workspace/${params.sessionId}/knowledges`,
        `/workspace/${params.sessionId}/memories`,
      ],
      async onWorkspaceChanged() {
        scheduleWorkspaceBackup(
          {
            id: instance.id,
            tenantId: instance.tenantId,
            userId: instance.userId,
            agentId: instance.agentId,
            sandboxId: instance.sandboxId,
          },
          client,
        );
      },
    }).filter((tool) => {
      if (tool.name === 'terminal') return true;
      if (selected.size === 0) return false;
      return selected.has(tool.name);
    });

    return {
      instanceId: instance.id,
      sandboxId: instance.sandboxId,
      promptBlock,
      tools,
    };
  }

  const agentLoop = createAgentLoop({
    llmGateway,
    knowledgeBase,
    memory,
    async scheduleMemoryConsolidation(params) {
      await scheduleMemoryConsolidation(params);
    },
    eventEmitter,
    toolRegistry,
    agentService: agentCrudService,
    prepareRuntime: prepareAgentRuntime,
    // 思考档位以模型端 ai_model.reasoning_options 声明为准：请求值与 Agent 默认值都要照此校验
    async resolveAllowedThinkingLevels(modelRef, tenantId) {
      const runtime = await providerService.resolveRuntimeModel(modelRef, tenantId || 'default');
      if (!runtime) return null;
      return allowedThinkingLevels(runtime.supportsThinking, runtime.reasoningOptions);
    },
    beforeToolCall: deps.hooks?.beforeToolCall,
    afterToolCall: deps.hooks?.afterToolCall,
    transformContext: deps.hooks?.transformContext,
    prepareNextTurn: deps.hooks?.prepareNextTurn,
    getApiKey: deps.hooks?.getApiKey,
    dynamicToolResolver: deps.hooks?.dynamicToolResolver,
    // 工具审批决策点：按运行模式（runMode，按消息粒度）在「人工审批 / 子智能体审批 / 直接放行」间选择。
    // critical 风险工具无视运行模式，始终人工审批（强制底线）。
    authorizeToolCall: async ({ toolCall, args, context, tool }) => {
      const input = args as Record<string, unknown>;
      const riskLevel: RiskLevel = tool.riskLevel ?? 'low';
      const runMode: RunMode = context.runMode ?? 'ask';

      // auto 模式先取子智能体判定；判定不可用（未配置模型 / 异常 / 输出非法）时为 null，
      // 由 resolveApprovalAction fail-closed 回落人工审批——绝不因为"判不出来"而放行。
      // critical 工具不浪费这次调用，直接人工审批。
      const verdict =
        runMode === 'auto' && riskLevel !== 'critical'
          ? await judgeToolCall({
              agentId: context.agentId,
              tenantId: context.tenantId,
              toolName: toolCall.name,
              ...(tool.description === undefined ? {} : { toolDescription: tool.description }),
              riskLevel,
              input,
            })
          : null;
      const decision = resolveApprovalAction({ riskLevel, runMode, verdict });

      if (decision.action === 'trust') {
        // 信任模式：留审计事件，但不写 ai_approval_request——
        // 否则批准态的行会被 findRecentApproved 命中，导致切回 ask 模式后被跨模式自动放行
        eventBus?.emit(
          { name: 'ai.approval.bypassed' },
          {
            toolName: toolCall.name,
            riskLevel,
            tenantId: context.tenantId,
            requestedBy: context.userId,
            sessionId: context.sessionId,
          },
        );
        return {
          approved: true,
          reason: '信任模式：跳过审批',
          approval: { mode: 'trust' as const, reason: '信任模式' },
        };
      }

      if (decision.action === 'auto-approve' || decision.action === 'auto-reject') {
        eventBus?.emit(
          { name: 'ai.approval.auto_decided' },
          {
            toolName: toolCall.name,
            riskLevel,
            decision: decision.action === 'auto-approve' ? 'approve' : 'reject',
            reason: decision.reason,
            tenantId: context.tenantId,
            requestedBy: context.userId,
            sessionId: context.sessionId,
          },
        );
        return decision.action === 'auto-approve'
          ? {
              approved: true,
              reason: `自动审批放行：${decision.reason}`,
              approval: { mode: 'auto' as const, reason: decision.reason },
            }
          : { approved: false, reason: `自动审批拒绝：${decision.reason}` };
      }

      // 人工审批：ask 模式、critical 工具，以及 auto 判定失败的情形
      const recent = await approvalService.findRecentApproved(
        toolCall.name,
        input,
        context.userId,
        context.tenantId,
      );
      if (recent) return { approved: true, reason: '该工具此前已获审批' };
      // 无人值守（后台任务唤醒）：没有人在线点审批，直接拒绝而不是挂起等待超时。
      // 已批准过的同工具同参数仍可放行（上面的 recent 分支），不引入任何自动批准路径。
      if (context.unattended) {
        eventBus?.emit(
          { name: 'ai.approval.unattended_denied' },
          {
            toolName: toolCall.name,
            riskLevel,
            tenantId: context.tenantId,
            requestedBy: context.userId,
            sessionId: context.sessionId,
          },
        );
        return {
          approved: false,
          reason: '后台任务为无人值守运行，需要人工审批的工具未执行',
        };
      }
      const sessionId = context.sessionId;
      try {
        const request = await approvalService.request(
          toolCall.name,
          input,
          context.userId,
          context.tenantId,
          // 聊天内审批：有效期与等待窗口对齐（10 分钟），超时即默认拒绝
          { ttlMs: IN_CHAT_APPROVAL_WAIT_MS, ...(sessionId ? { sessionId } : {}) },
        );
        // 台账落盘：刷新页面后前端据此还原待审批弹窗（写失败不影响审批主流程）
        if (sessionId) {
          await appendApprovalJournal(
            { tenantId: context.tenantId, userId: context.userId },
            sessionId,
            'approval_request',
            {
              id: request.id,
              toolName: request.toolName,
              input: request.input,
              riskLevel,
              expiresAt: request.expiresAt,
              toolCallId: toolCall.id,
              requestedBy: context.userId,
              createdAt: request.createdAt,
            },
          );
        }
        return {
          approved: false,
          approvalRequest: {
            id: request.id,
            toolName: request.toolName,
            input: request.input,
            expiresAt: request.expiresAt,
            riskLevel,
            // 前端据此把审批状态标在同一个工具行上
            toolCallId: toolCall.id,
          },
        };
      } catch (err) {
        return {
          approved: false,
          reason: `审批请求创建失败：${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
    waitForApproval: waitForApprovalWithExpiry,
    tracer: deps.tracer,
    parentSpanContext: deps.parentSpanContext,
    mcpToolSource,
    async resolveSkills(skillIds, tenantId) {
      const skills = await Promise.all(skillIds.map((id) => skillService.getById(id, tenantId)));
      return skills.flatMap((skill) => {
        if (!skill?.enabled || !skill.skillMdContent) return [];
        const content = skill.skillMdContent.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
        return [
          {
            name: skill.slug,
            description: skill.description ?? skill.name,
            content,
            filePath: `${storagePath}/skills/${skill.slug}/${skill.installedVersion ?? 'current'}/SKILL.md`,
          },
        ];
      });
    },
    // 会话级专家：磁盘 sha256 复核 + 启用/扫描状态 fail-closed（readExpertContent 内部处理）。
    // team 传 composeTeam=false：协调者模式只用团队主 prompt，成员清单由
    // resolveExpertTeamMembers 运行时解析，成员全文不进协调者上下文。
    async resolveExpert(expertId, tenantId) {
      const found = await expertService.readExpertContent(expertId, tenantId, {
        composeTeam: false,
      });
      return found
        ? { name: found.meta.name, prompt: found.prompt, expertType: found.meta.expertType }
        : null;
    },
    // 团队专家可委派成员（fail-closed：任一成员不可用即 null）
    resolveExpertTeamMembers: (expertId, tenantId) =>
      expertService.resolveTeamMembers(expertId, tenantId),
    // 专家团委派子运行：为成员专家新开独立 agent-loop 运行（agentId 空 = 无 Agent 绑定的
    // 最小权限运行：无 registry 工具、人设与模型全部显式提供；不携带任何委派能力 → 深度固定 1）。
    async defaultDelegateRunner(memberExpertId, task, ctx) {
      const content = await expertService.readExpertContent(memberExpertId, ctx.tenantId);
      if (!content || content.meta.expertType === 'team') {
        throw new Error(`成员专家 ${memberExpertId} 不可用`);
      }
      if (!agentLoopRef) {
        throw new Error('AI 运行时尚未就绪');
      }
      let output = '';
      for await (const chunk of agentLoopRef.runStream({
        agentId: '',
        userId: ctx.userId || 'system',
        tenantId: ctx.tenantId,
        message: task,
        systemPrompt: content.prompt,
        model: ctx.model,
        maxTokens: 2048,
        ...(ctx.signal ? { signal: ctx.signal } : {}),
      })) {
        if (chunk.type === 'content' && chunk.delta) output += chunk.delta;
        if (chunk.type === 'error') {
          throw new Error(chunk.error?.message ?? '成员专家运行失败');
        }
      }
      return output.trim() || '（成员专家未返回内容）';
    },
  });
  agentLoopRef = agentLoop;

  // 创建中间件（由调用方注入，见 AIModuleDeps）
  const perm = deps.permMiddleware;

  // 创建路由
  const runtimeHostRouter = createRuntimeHostRoutes({
    hostService: runtimeHostService,
    instanceService: runtimeInstances,
    capacity: runtimeCapacity,
    clients: runtimeClients,
    authMiddleware,
    perm,
    ...(deps.platformAdminMiddleware
      ? { platformAdminMiddleware: deps.platformAdminMiddleware }
      : {}),
  });
  const kbRouter = createKnowledgeBaseRoutes(knowledgeBase, authMiddleware, perm, providerService, {
    onKbChanged: scheduleKbSync,
  });
  const providerRouter = createProviderRoutes(providerService, authMiddleware, perm);
  const agentRouter = createAgentRoutes(agentCrudService, authMiddleware, perm, {
    storagePath: `${storagePath}/skills/.workspace`,
  });
  // 会话统一入口：JSONL 为准 + ai_session_meta 投影（渠道/定时任务等复用同一层）
  const sessionService = createSessionService({
    memory,
    ...(db ? { db: db as import('@ventostack/database').Database } : {}),
  });
  sessionServiceRef = sessionService;

  // ---- 后台任务（脚本任务 + 定时唤醒） ----
  // 实例标识用于多实例租约归属；同一实例内的运行互斥由 RunRegistry 进程内 Map 负责。
  const instanceId =
    process.env.VENTO_INSTANCE_ID?.trim() || `${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
  const backgroundTaskService = createBackgroundTaskService({ db: runtimeDb });
  backgroundTaskServiceRef = backgroundTaskService;
  // 全局工具注册表只用于「列出工具 / Agent 编辑页勾选」；按请求创建的工具实例在
  // buildBaseToolRegistry 中注册（带 tenant/user/session 作用域）。这里补目录占位。
  for (const tool of createBackgroundTaskToolCatalog()) {
    if (!toolRegistry.get(tool.name)) toolRegistry.register(tool);
  }
  const runRegistry = createRunRegistry({ db: runtimeDb, instanceId });
  const backgroundTaskRunner = createBackgroundTaskRunner({
    tasks: backgroundTaskService,
    instanceId,
    sessionRuns: runRegistry,
    ...(deps.backgroundTasks?.tickIntervalMs === undefined
      ? {}
      : { tickIntervalMs: deps.backgroundTasks.tickIntervalMs }),
    ...(deps.backgroundTasks?.maxTriggerPerTick === undefined
      ? {}
      : { maxTriggerPerTick: deps.backgroundTasks.maxTriggerPerTick }),
    ...(deps.backgroundTasks?.maxScriptsPerTick === undefined
      ? {}
      : { maxScriptsPerTick: deps.backgroundTasks.maxScriptsPerTick }),
    ...(deps.backgroundTasks?.turnTimeoutMs === undefined
      ? {}
      : { turnTimeoutMs: deps.backgroundTasks.turnTimeoutMs }),
    /** 脚本执行环境：ensure=true 时确保虚拟机就绪（任务首次启动），否则按既有实例探活 */
    async resolveRuntime(task, options) {
      try {
        let instance = options.ensure
          ? null
          : task.instanceId
            ? await runtimeInstances.getById(task.instanceId)
            : null;
        if (options.ensure) {
          const agent = (await agentCrudService.getById(
            task.agentId,
            task.tenantId,
          )) as AgentConfig | null;
          if (!agent?.requiresVirtualEnvironment) return null;
          const ensured = await runtimeInstances.ensure({
            tenantId: task.tenantId,
            userId: task.userId,
            agentId: task.agentId,
            ...(agent.networkEnabled === undefined ? {} : { networkEnabled: agent.networkEnabled }),
          });
          instance = ensured.instance;
          if (!instance.sandboxId) return null;
          // 会话输出目录与交互式对话保持一致
          await ensured.client
            .runCommand(
              instance.sandboxId,
              [
                'sh',
                '-lc',
                `mkdir -p ${shellQuote(`/workspace/${task.sessionId}/outputs`)} ${shellQuote('/workspace/.agent-logs')}`,
              ],
              { cwd: '/workspace', timeoutMs: 15_000 },
            )
            .catch(() => undefined);
          return {
            client: ensured.client,
            instanceId: instance.id,
            sandboxId: instance.sandboxId,
            workspace: '/workspace',
          };
        }
        if (!instance || instance.state !== 'running' || !instance.sandboxId) return null;
        const client = await runtimeClients.get(instance.hostId);
        return {
          client,
          instanceId: instance.id,
          sandboxId: instance.sandboxId,
          workspace: '/workspace',
        };
      } catch (error) {
        console.warn(
          '[ai] 后台任务解析虚拟机运行时失败:',
          error instanceof Error ? error.message : error,
        );
        return null;
      }
    },
    /** 定时唤醒/完成通知：跑一轮无头 Agent（与 Web 对话共用工具注册表与会话运行租约） */
    async runAgentTurn({ task, message, signal }) {
      if (!agentLoopRef) throw new Error('AI 运行时尚未就绪');
      const toolRegistry = await buildToolRegistry(task.tenantId, task.userId, task.sessionId);
      let finalContent = '';
      for await (const chunk of agentLoopRef.runStream({
        agentId: task.agentId,
        userId: task.userId,
        tenantId: task.tenantId,
        sessionId: task.sessionId,
        message,
        toolRegistry,
        // 无人值守：auto 由审批子智能体判定；需要人工审批的工具立即拒绝而非挂起
        runMode: 'auto',
        unattended: true,
        signal,
      })) {
        if (chunk.type === 'content' && chunk.delta) finalContent += chunk.delta;
        if (chunk.type === 'error') {
          throw new Error(chunk.error?.message ?? '后台 Agent 运行失败');
        }
      }
      // 平台钩子：渠道自动推送 + VM 全局记忆/工作区回写（失败不影响任务结算）
      if (deps.onRunFinished && finalContent) {
        await deps
          .onRunFinished({
            sessionId: task.sessionId,
            agentId: task.agentId,
            tenantId: task.tenantId,
            userId: task.userId,
            finalContent,
          })
          .catch((error) => console.warn('[ai] 后台任务结束钩子失败（不影响任务）:', error));
      }
      return finalContent.trim();
    },
    async notify({ task, title, content }) {
      await deps.notification?.send({
        receiverId: task.userId,
        channel: 'in_app',
        title,
        content,
      });
      eventBus?.emit(
        { name: 'ai.background_task.notified' },
        { taskId: task.id, tenantId: task.tenantId, userId: task.userId },
      );
    },
    emit(name, payload) {
      eventBus?.emit({ name }, payload);
    },
    async appendSessionEntry(task, data) {
      await memory.appendCustomEntry(
        task.sessionId,
        { tenantId: task.tenantId, userId: task.userId },
        'background_task',
        data,
      );
    },
  });

  // 会话服务适配层：保持既有 ConversationService 契约（字段名 id），并带上 origin
  const conversationService: ConversationService = {
    async create(params) {
      const { sessionId } = await sessionService.create({
        userId: params.userId,
        agentId: params.agentId,
        tenantId: params.tenantId,
      });
      return { id: sessionId };
    },
    async getById(id, userId, tenantId) {
      const view = await sessionService.get(id, { tenantId, userId });
      if (!view) return null;
      return {
        id: view.sessionId,
        agentId: view.agentId,
        userId: view.userId,
        title: view.title,
        status: view.status,
        messageCount: view.messageCount,
        tenantId: view.tenantId,
        origin: view.origin,
        settings: view.settings,
        createdAt: view.createdAt,
        updatedAt: view.updatedAt,
      };
    },
    async list(params) {
      const views = await sessionService.list({
        tenantId: params.tenantId,
        userId: params.userId,
        ...(params.agentId ? { agentId: params.agentId } : {}),
      });
      return views.map((v) => ({
        id: v.sessionId,
        agentId: v.agentId,
        userId: v.userId,
        title: v.title,
        status: v.status,
        messageCount: v.messageCount,
        tenantId: v.tenantId,
        origin: v.origin,
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
      }));
    },
    async delete(id, userId, tenantId) {
      // 会话删除只清理会话级运行时镜像，不销毁用户+Agent 共享的虚拟机。
      try {
        const view = await sessionService.get(id, { tenantId, userId });
        if (view) {
          const instance = await runtimeInstances.get(tenantId, userId, view.agentId);
          if (instance?.sandboxId) {
            const client = await runtimeClients.get(instance.hostId);
            await runtimeKbSync.removeSession(tenantId, id, client);
          } else {
            await runtimeKbSync.removeSession(tenantId, id);
          }
        }
      } catch (error) {
        console.warn('[ai] 清理会话虚拟机镜像失败（继续删除会话）:', error);
      }
      // 软删除：移入回收站，可在回收站恢复或彻底删除（同步标记 meta 行）
      await sessionService.delete(id, { tenantId, userId });
    },
    async getMessages(id, userId, tenantId, limit) {
      return sessionService.getHistory(id, { tenantId, userId }, limit ?? 50);
    },
  };

  const chatRouter = createChatRoutes(
    agentLoop,
    conversationService,
    authMiddleware,
    perm,
    memory,
    {
      // 会话运行租约与后台任务共用：后台唤醒不会与在线对话互相踩历史
      runRegistry,
      // 对话/流式请求按 ctx.user.tenantId 构建请求级工具注册表（KB 工具绑定请求租户）
      createTenantToolRegistry: buildToolRegistry,
      // 聊天内嵌审批：请求者自确认
      approvalService,
      scheduleMemoryConsolidation,
      // 一轮结束后的平台钩子：渠道自动推送 + VM 全局记忆/工作区回写
      async onRunFinished(params) {
        if (deps.onRunFinished) {
          await deps.onRunFinished(params).catch((error) => {
            console.warn('[ai] 渠道结束钩子失败（不影响对话）:', error);
          });
        }
        const instance = await runtimeInstances
          .get(params.tenantId, params.userId, params.agentId)
          .catch(() => null);
        if (!instance?.sandboxId) return;
        try {
          const client = await runtimeClients.get(instance.hostId);
          await runtimeMemorySync.pushGlobal({
            tenantId: instance.tenantId,
            userId: instance.userId,
            instance: {
              id: instance.id,
              sandboxId: instance.sandboxId,
              tenantId: instance.tenantId,
            },
            client,
          });
          await runtimeWorkspaceBackup.syncInstance(
            {
              id: instance.id,
              tenantId: instance.tenantId,
              userId: instance.userId,
              agentId: instance.agentId,
              sandboxId: instance.sandboxId,
            },
            client,
          );
        } catch (error) {
          console.warn('[ai] 回合结束同步虚拟机数据失败（不阻断对话）:', error);
        }
      },
      // 会话标题生成：Agent 配置 summaryModel（轻量快速模型）时，对话结束后生成 ≤20 字标题
      generateSessionTitle: async ({ sessionId, agentId, tenantId, userId }) => {
        try {
          const agent = await agentCrudService.getById(agentId, tenantId);
          const summaryModel = agent?.summaryModel;
          if (!summaryModel) return null;
          // 已有自定义标题（非默认命名）则跳过，避免覆盖用户/历史命名
          const existing = await memory.getSession(sessionId, { tenantId, userId });
          if (!existing) return null;
          if (existing.title !== `对话 ${sessionId.slice(0, 8)}`) return null;
          const history = (await memory.getHistory(sessionId, { tenantId, userId }, 20))
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .slice(-10);
          if (history.length === 0) return null;
          const result = await llmGateway.chat({
            model: summaryModel,
            tenantId,
            // 标题是纯摘要任务：关掉思考，避免推理模型把 token 预算耗在 reasoning_content 上
            // 导致 content 为空（finish_reason=length）而拿不到标题
            thinkingLevel: 'off',
            maxTokens: 256,
            messages: [
              {
                role: 'system',
                content:
                  '你是会话标题生成器。根据以下对话内容生成一个不超过20字的中文标题，只输出标题本身，不要输出任何其他内容、引号或解释。',
              },
              ...history,
            ],
          });
          const title = result.content
            .trim()
            .replace(/^[「『"'“”]+|[」』"'“”]+$/g, '')
            .split('\n')[0]
            .slice(0, 20)
            .trim();
          if (!title) return null;
          await memory.renameSession(sessionId, { tenantId, userId }, title);
          return title;
        } catch (err) {
          console.error('[ai] 会话标题生成失败:', err);
          return null;
        }
      },
    },
  );

  // Skill 服务
  const modelConfigService = createModelConfigService({ db });
  const scopedKBService = createScopedKBService({ db, eventBus });

  // Skill 路由
  const skillRouter = createSkillRoutes(skillService, skillStoreService, authMiddleware, perm, {
    storagePath: `${storagePath}/skills`,
    workspacePath: `${storagePath}/skills/.workspace`,
  });

  // Expert 路由
  const expertRouter = createExpertRoutes(expertService, authMiddleware, perm);

  // MCP Server 服务
  const mcpRouter = createMcpServerRoutes(mcpServerService, authMiddleware, perm);

  // 连接器路由
  const connectorRouter = createConnectorRoutes(connectorService, authMiddleware, perm);

  // 后台任务路由（查看/取消/暂停/恢复/立即执行）
  const backgroundTaskRouter = createBackgroundTaskRoutes(
    {
      tasks: backgroundTaskService,
      readTaskLog: (task) => readBackgroundTaskLog(task),
    },
    authMiddleware,
    perm,
  );

  // 工具注册表路由
  const toolRegistryRouter = createToolRegistryRoutes(toolRegistry, authMiddleware, perm);

  // 合并路由
  const router = createRouter();
  router.merge(kbRouter);
  router.merge(agentRouter);
  router.merge(chatRouter);
  router.merge(providerRouter);
  router.merge(skillRouter);
  router.merge(expertRouter);
  router.merge(mcpRouter);
  router.merge(connectorRouter);
  router.merge(backgroundTaskRouter);
  router.merge(runtimeHostRouter);
  router.merge(toolRegistryRouter);

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
          createLazyJsonlSessionStorage(sessionPath, {
            cwd: storagePath,
            sessionId,
          }),
        ),
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
      expertService,
      modelConfigService,
      scopedKBService,
      mcpServerService,
      connectorService,
      sessionService,
      runtimeHosts: runtimeHostService,
      runtimeInstances,
      runtimeCapacity,
      runtimeKbSync,
      runtimeWorkspaceBackup,
      createToolRegistry: buildToolRegistry,
      // 渠道通知等平台侧能力需要读 Agent 的 summaryModel；直接依赖 ai_agent 表会绕过本模块的缓存与校验
      agentCrud: agentCrudService,
      backgroundTasks: backgroundTaskService,
      backgroundTaskRunner,
      runRegistry,
    },
    router,
    createHarness,
    async init() {
      await providerService.encryptStoredCredentials();

      if (deps.agentRuntime) {
        await runtimeHostService
          .ensureEnvHost(deps.agentRuntime)
          .catch((error) => console.warn('[ai] 导入环境变量虚拟机宿主失败:', error));
      }
      runtimeMonitor.start();
      if (runtimeSettings.workspaceBackup.enabled && !runtimeWorkspaceBackupTimer) {
        const backupAll = () => {
          if (runtimeWorkspaceBackupRunning) return;
          runtimeWorkspaceBackupRunning = true;
          void (async () => {
            const list = await runtimeInstances.listAll();
            for (const instance of list) {
              if (instance.state !== 'running' || !instance.sandboxId) continue;
              try {
                const client = await runtimeClients.get(instance.hostId);
                await runtimeWorkspaceBackup.syncInstance(
                  {
                    id: instance.id,
                    tenantId: instance.tenantId,
                    userId: instance.userId,
                    agentId: instance.agentId,
                    sandboxId: instance.sandboxId,
                  },
                  client,
                );
              } catch (error) {
                console.warn('[ai] 定时工作区备份失败（不阻断）:', error);
              }
            }
          })()
            .catch((error) => console.warn('[ai] 定时工作区备份任务失败:', error))
            .finally(() => {
              runtimeWorkspaceBackupRunning = false;
            });
        };
        runtimeWorkspaceBackupTimer = setInterval(
          backupAll,
          runtimeSettings.workspaceBackup.intervalMs,
        );
        (runtimeWorkspaceBackupTimer as unknown as { unref?: () => void }).unref?.();
      }
      if (!runtimeNotifierTimer) {
        const runNotifier = () => {
          void runtimeNotifier.runOnce().catch((error) => {
            console.warn('[ai] 虚拟机闲置提醒任务失败:', error);
          });
        };
        runNotifier();
        runtimeNotifierTimer = setInterval(runNotifier, 6 * 3_600_000);
        (runtimeNotifierTimer as unknown as { unref?: () => void }).unref?.();
      }

      // 后台任务调度循环（脚本探活 + 定时唤醒）；启动时会先做一次崩溃自愈
      backgroundTaskRunner.start();

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
    async shutdown() {
      await backgroundTaskRunner.stop();
      runRegistry.shutdown();
      runtimeMonitor.stop();
      if (runtimeNotifierTimer) clearInterval(runtimeNotifierTimer);
      runtimeNotifierTimer = null;
      if (runtimeWorkspaceBackupTimer) clearInterval(runtimeWorkspaceBackupTimer);
      runtimeWorkspaceBackupTimer = null;
      for (const timer of runtimeBackupTimers.values()) clearTimeout(timer);
      runtimeBackupTimers.clear();
      for (const timer of kbSyncTimers.values()) clearTimeout(timer);
      kbSyncTimers.clear();
      runtimeClients.clear();
    },
  };
}

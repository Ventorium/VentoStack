/**
 * @ventostack/ai — AI 模块公共入口
 *
 * 完整 AI 平台能力：
 * - 工具注册、沙箱、审批
 * - 多 provider LLM Gateway（OpenAI / Anthropic / Google）
 * - 模型注册表
 * - Agent 引擎（事件系统、hooks、并行执行）
 * - Agent Harness（高级生命周期管理）
 * - Session 树形存储 + JSONL 持久化
 * - Context Compaction（LLM 摘要压缩）
 * - Skill 系统（SKILL.md 加载）
 * - Prompt Template 系统
 * - RAG 知识库
 * - 记忆系统
 */

// ---- Tool Registry ----
export { createToolRegistry } from "./tool-registry";
export type {
  ToolParameter,
  ToolDefinition,
  ToolExecutionResult,
  ToolRegistry,
} from "./tool-registry";

// ---- Sandbox ----
export { createSandbox } from "./sandbox";
export type { SandboxPermissions, Sandbox } from "./sandbox";

// ---- Approval ----
export { createApprovalManager } from "./approval";
export type {
  ApprovalStatus,
  ApprovalRequest,
  ApprovalOptions,
  ApprovalManager,
} from "./approval";

// ---- Context Manager (legacy) ----
export { createContextManager } from "./context";
export type {
  ConversationMessage,
  ConversationContext,
  ContextManager,
} from "./context";

// ---- RAG ----
export { createKnowledgeBase, createAgentRegistry } from "./rag";
export type {
  Document,
  ChunkOptions,
  SearchResult,
  KnowledgeBase,
  AgentConfig,
  AgentRegistry,
} from "./rag";

// ---- Document Loader ----
export { loadDocumentsFromDirectory, parseMarkdownFrontmatter } from "./document-loader";
export type { DocumentLoaderOptions, LoadResult } from "./document-loader";

// ---- LLM Client (legacy) ----
export { createLLMClient } from "./llm";
export type { ChatMessage, LLMClientOptions, LLMClient } from "./llm";

// ---- LLM Gateway ----
export { createLLMGateway } from "./llm-gateway/gateway";
export { createOpenAIProvider } from "./llm-gateway/providers/openai";
export { createAnthropicProvider } from "./llm-gateway/providers/anthropic";
export { createGoogleProvider } from "./llm-gateway/providers/google";
export { createModelRegistry } from "./llm-gateway/model-registry";
export { withRetry } from "./llm-gateway/retry";
export { createRequestQueue } from "./llm-gateway/queue";
export type {
  LLMProvider,
  ProviderCapabilities,
  LLMGateway,
  ChatParams,
  ChatResult,
  StreamChunk,
  TokenUsage,
  ModelInfo,
  LLMGatewayConfig,
  LLMToolDefinition,
  ToolCall,
} from "./llm-gateway/types";
export type { ModelConfig, ModelRegistry } from "./llm-gateway/model-registry";

// ---- RAG Agent ----
export { createRAGAgent } from "./rag-agent";
export type {
  RAGAgentConfig,
  RAGAgentDeps,
  RAGSource,
  RAGChatResult,
  RAGAgent,
} from "./rag-agent";

// ---- Skills ----
export { loadSkills, createSkillManager, formatSkillsForSystemPrompt, formatSkillInvocation } from "./skills";
export type { Skill, SkillDiagnostic, SkillDiagnosticCode, SkillManager } from "./skills";

// ---- Prompt Templates ----
export { loadPromptTemplates, createPromptTemplateManager, formatPromptTemplateInvocation, parseCommandArgs, substituteArgs } from "./prompt-templates";
export type { PromptTemplate, PromptTemplateDiagnostic, PromptTemplateManager } from "./prompt-templates";

// ---- Session ----
export { createSession, createJsonlSessionStorage, loadJsonlSessionStorage } from "./session";
export type {
  Session,
  SessionStorage,
  SessionMetadata,
  SessionContext,
  SessionTreeEntry,
  MessageEntry,
  CompactionEntry,
  BranchSummaryEntry,
  LeafEntry,
} from "./session";

// ---- Compaction ----
export { prepareCompaction, compact, estimateTokenCount, DEFAULT_COMPACTION_SETTINGS } from "./compaction";
export type { CompactionSettings, CompactionResult, CompactionPreparation } from "./compaction";

// ---- Agent Engine ----
export { createAgentLoop } from "./agent-engine/agent-loop";
export { createEventEmitter } from "./agent-engine/events";
export { createAgentHarness } from "./agent-engine/harness";
export { createMessageQueue } from "./agent-engine/message-queue";
export type {
  AgentConfig,
  AgentLoopDeps,
} from "./agent-engine/agent-loop";
export type {
  AgentEvent,
  AgentEventHandler,
  AgentEventEmitter,
  AgentEventMessage,
  AgentStartEvent,
  AgentEndEvent,
  TurnStartEvent,
  TurnEndEvent,
  MessageStartEvent,
  MessageUpdateEvent,
  MessageEndEvent,
  ToolExecutionStartEvent,
  ToolExecutionUpdateEvent,
  ToolExecutionEndEvent,
  ContextEvent,
  BeforeProviderRequestEvent,
  AbortEvent,
  SettledEvent,
  ErrorEvent,
} from "./agent-engine/events";
export type {
  AgentHarness,
  AgentHarnessOptions,
  HarnessEvent,
  HarnessOwnEvent,
  HarnessToolUpdateEvent,
  HarnessModelUpdateEvent,
  HarnessResourcesUpdateEvent,
} from "./agent-engine/harness";
export type { MessageQueue, QueueMode } from "./agent-engine/message-queue";
export type {
  AgentTool,
  AgentToolResult,
  AgentContext,
  AgentLoopConfig,
  AgentRunParams,
  AgentRunResult,
  ToolExecutionMode,
  BeforeToolCallContext,
  BeforeToolCallResult,
  AfterToolCallContext,
  AfterToolCallResult,
  ToolUpdateCallback,
} from "./agent-engine/types";

// ---- AI Module (聚合) ----
export { createAIModule } from "./module";
export type { AIModule, AIModuleDeps, LLMProviderConfig } from "./module";

// ---- Agent Service ----
export { createAgentService } from "./services/agent";

// ---- Provider Service ----
export { createProviderService } from "./services/provider";

// ---- Migration ----
export { createAiKnowledgeTables } from "./migrations/003_create_ai_knowledge_tables";
export { createAiAgentTables } from "./migrations/004_create_ai_agent_tables";
export { createAiProviderTables } from "./migrations/005_create_ai_provider_tables";

// ---- Tool Policy (renamed from Sandbox) ----
export { createToolPolicy } from "./tool-policy";
export type { ToolPolicy } from "./tool-policy";

// ---- Code Sandbox ----
export { createProcessSandbox, createDockerSandbox, DEFAULT_SANDBOX_CONFIG } from "./code-sandbox";
export type { CodeSandboxConfig, CodeExecution, CodeSandbox, DockerSandboxConfig } from "./code-sandbox";

// ---- Distributed Lock ----
export { createDistributedLock } from "./agent-engine/distributed-lock";
export type { DistributedLock } from "./agent-engine/distributed-lock";

// ---- Token Budget ----
export { createTokenBudgetChecker } from "./agent-engine/token-budget";
export type { TokenBudgetConfig, TokenBudgetChecker } from "./agent-engine/token-budget";

// ---- Connection Limiter ----
export { createConnectionLimiter } from "./stream-engine/connection-limiter";
export type { ConnectionLimiter } from "./stream-engine/connection-limiter";

// ---- Heartbeat ----
export { createHeartbeat } from "./stream-engine/heartbeat";
export type { HeartbeatConfig, HeartbeatController } from "./stream-engine/heartbeat";

// ---- AI Cache ----
export { createAICache } from "./cache/ai-cache";
export type { AICache } from "./cache/ai-cache";

// ---- Knowledge Base Tools ----
export { createKBBrowseTool, createKBReadTool, createKBSearchTool, createKBFollowLinkTool } from "./tools";
export { createCalculatorTool, createTerminalTool, createFileReadTool, createFileWriteTool, createSQLQueryTool } from "./tools";

// ---- Knowledge Base Tenant Query ----
export { createTenantQuery } from "./knowledge-base/tenant-query";
export type { TenantQuery } from "./knowledge-base/tenant-query";

// ---- Knowledge Base CRUD Service ----
export { createKnowledgeBaseCrudService } from "./services/knowledge-base";
export type { KnowledgeBaseItem, DocumentItem } from "./services/knowledge-base";

// ---- Conversation Service ----
export { createConversationService } from "./services/conversation";
export type { ConversationItem } from "./services/conversation";

// ---- Approval Service ----
export { createApprovalService } from "./services/approval";
export type { ApprovalRequest as ApprovalRequestItem } from "./services/approval";

// ---- Routes ----
export { createConversationRoutes, createApprovalRoutes, createHealthRoutes } from "./routes";
export type { ConversationCrudService, ApprovalCrudService, HealthCheckDeps } from "./routes";

// ---- Document Model ----
export { AiDocumentModel } from "./models/document";

// ---- Skill Store Service ----
export { createSkillStoreService } from "./services/skill-store";
export type { StoreSearchResult, StoreSkillDetail, StoreFileItem, StoreEvaluation, StoreRecommendation, SkillStoreService } from "./services/skill-store";

// ---- Skill Service ----
export { createSkillService } from "./services/skill";
export type { SkillItem, InstallFromStoreParams, SkillServiceDeps } from "./services/skill";

// ---- Model Config Service ----
export { createModelConfigService } from "./services/model-config";
export type { ModelPurposeConfig, ModelConfigService, ModelDetail } from "./services/model-config";

// ---- Scoped KB Service ----
export { createScopedKBService } from "./services/kb-scope";
export type { KBScope, ScopedKBItem, ScopedKBDeps } from "./services/kb-scope";

// ---- Skill Routes ----
export { createSkillRoutes } from "./routes/skill";

// ---- Skill Models ----
export { AiSkillModel, AiAgentSkillModel } from "./models/skill";

// ---- Skill Migration ----
export { createAiSkillTables } from "./migrations/006_create_ai_skill_tables";

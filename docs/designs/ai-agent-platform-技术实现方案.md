# VentoStack AI Agent 平台 — 技术实现方案

> 基于设计文档 v3.0，按照项目编码规范，给出每个文件的精确实现规格。
> 版本：v2.0 | 日期：2026-06-10 | 阶段：LLM Wiki 模式重构
>
> v2.0 变更：知识库从 RAG/Embedding 模式改为 LLM Wiki 模式
> - 去掉 pgvector、Embedding、分块器、向量检索
> - 知识以 Markdown 文件直接存储，LLM 通过工具调用自主浏览
> - 新增知识库工具：kb-browse、kb-read、kb-search、kb-follow-link
> - 使用 PostgreSQL 内置全文搜索（gin 索引）
> - 简化数据模型：去掉 ai_chunk 表
>
> v1.1 变更：编码规范 + 实现完整性修正（错误 cause 链、具体类型、分布式锁等）
> - 错误类统一支持 cause 链
> - Service 层返回具体类型（非 unknown）
> - TenantQuery 移除 raw()，使用泛型
> - 补充审批路由、健康检查路由、分布式锁、Token 限流、SSE 连接限制、缓存策略、文件安全
> - 迁移文件拆分为两个
> - Mock 策略对齐现有 createMockDatabase 模式

---

## 一、文件结构

```
packages/platform/ai/src/
├── llm-gateway/
│   ├── types.ts                # LLM 网关类型定义
│   ├── gateway.ts              # createLLMGateway 工厂
│   ├── providers/
│   │   ├── openai.ts           # createOpenAIProvider
│   │   └── anthropic.ts        # createAnthropicProvider
│   ├── retry.ts                # withRetry 指数退避
│   ├── queue.ts                # createRequestQueue 并发控制
│   └── index.ts                # 统一导出
├── knowledge-base/
│   ├── types.ts                # 知识库类型定义
│   ├── service.ts              # createKnowledgeBaseService（文件管理）
│   ├── tenant-query.ts         # createTenantQuery 租户隔离
│   ├── file-security.ts        # createFileValidator
│   ├── markdown-parser.ts      # 解析 frontmatter + 提取 wiki links
│   └── index.ts
├── agent-engine/
│   ├── types.ts                # Agent 引擎类型定义
│   ├── agent-loop.ts           # createAgentLoop
│   ├── prompt-builder.ts       # 消息组装 + token 裁剪
│   ├── prompt-guard.ts         # createPromptGuard 多层防护
│   ├── tool-call-handler.ts    # 工具调用解析 + JSON 修复
│   ├── distributed-lock.ts     # createDistributedLock
│   ├── token-budget.ts         # createTokenBudgetChecker
│   └── index.ts
├── memory/
│   ├── types.ts                # 记忆类型定义
│   ├── service.ts              # createMemoryService（数据库持久化）
│   └── index.ts
├── code-sandbox/
│   ├── types.ts                # 沙盒类型定义
│   ├── process.ts              # createProcessSandbox（仅 Bun）
│   ├── docker.ts               # createDockerSandbox（v1.0）
│   └── index.ts
├── stream-engine/
│   ├── sse.ts                  # createSSEResponse
│   ├── heartbeat.ts            # SSE 心跳
│   ├── connection-limiter.ts   # createConnectionLimiter
│   └── index.ts
├── cache/
│   └── ai-cache.ts             # createAICache
├── tools/
│   ├── kb-browse.ts            # createKBBrowseTool（浏览目录）
│   ├── kb-read.ts              # createKBReadTool（读取文件）
│   ├── kb-search.ts            # createKBSearchTool（全文搜索）
│   ├── kb-follow-link.ts       # createKBFollowLinkTool（追踪 wiki link）
│   ├── calculator.ts           # createCalculatorTool
│   ├── terminal.ts             # createTerminalTool（v1.0）
│   ├── file-ops.ts             # createFileReadTool / createFileWriteTool（v1.0）
│   ├── sql-query.ts            # createSQLQueryTool（v1.1）
│   └── index.ts
├── services/
│   ├── knowledge-base.ts       # 知识库 CRUD 服务
│   ├── agent.ts                # Agent CRUD 服务
│   ├── conversation.ts         # 对话服务
│   ├── approval.ts             # createApprovalService（持久化）
│   └── index.ts
├── models/
│   ├── knowledge-base.ts       # defineModel ai_knowledge_base
│   ├── document.ts             # defineModel ai_document
│   ├── agent.ts                # defineModel ai_agent
│   ├── conversation.ts         # defineModel ai_conversation
│   ├── message.ts              # defineModel ai_message
│   ├── tool-log.ts             # defineModel ai_tool_log
│   ├── approval.ts             # defineModel ai_approval_request
│   ├── long-term-memory.ts     # defineModel ai_long_term_memory
│   └── index.ts
├── routes/
│   ├── knowledge-base.ts       # 知识库路由
│   ├── agent.ts                # Agent 路由
│   ├── conversation.ts         # 对话路由
│   ├── chat.ts                 # 对话交互路由（含 SSE）
│   ├── approval.ts             # 审批路由
│   ├── audit.ts                # 审计日志路由
│   ├── health.ts               # 健康检查路由
│   ├── common.ts               # 响应辅助（复用 ok/fail）
│   └── index.ts
├── middlewares/
│   └── auth-guard.ts           # 认证/权限中间件（复用现有 createPermMiddleware）
├── migrations/
│   ├── 003_create_ai_knowledge_tables.ts  # 知识库 + 文档（LLM Wiki 模式）
│   └── 004_create_ai_agent_tables.ts      # Agent + 对话 + 消息 + 工具日志 + 审批 + 长期记忆
├── errors.ts                   # AI 错误类型定义
├── __tests__/
│   ├── helpers.ts              # 测试辅助（createMockLLMProvider 等）
│   ├── llm-gateway/
│   │   ├── gateway.test.ts
│   │   ├── retry.test.ts
│   │   └── queue.test.ts
│   ├── knowledge-base/
│   │   ├── service.test.ts
│   │   ├── file-security.test.ts
│   │   └── markdown-parser.test.ts
│   ├── agent-engine/
│   │   ├── agent-loop.test.ts
│   │   ├── prompt-builder.test.ts
│   │   ├── prompt-guard.test.ts
│   │   └── tool-call-handler.test.ts
│   ├── memory/
│   │   └── service.test.ts
│   ├── code-sandbox/
│   │   └── process.test.ts
│   ├── services/
│   │   ├── knowledge-base.test.ts
│   │   ├── agent.test.ts
│   │   ├── conversation.test.ts
│   │   └── approval.test.ts
│   └── routes/
│       ├── knowledge-base.test.ts
│       ├── agent.test.ts
│       ├── chat.test.ts
│       └── conversation.test.ts
├── module.ts                   # 模块聚合 createAIModule
└── index.ts                    # 统一导出（保留旧导出别名）

packages/platform/ai/package.json   # 新增依赖
apps/admin/api/src/database/
├── migrations.ts               # 注册 003_create_ai_tables
└── seeds/
    └── 003_ai_menus.ts         # AI 菜单 + 权限种子

apps/admin/web/src/
├── api/
│   ├── sse-client.ts           # createSSEClient
│   └── ai.ts                   # AI API 封装
├── components/ai/
│   ├── ChatBubble.tsx          # 对话气泡
│   ├── MarkdownRenderer.tsx    # 流式 Markdown 渲染
│   ├── SourceCard.tsx          # 引用卡片
│   └── AgentCard.tsx           # Agent 卡片
└── pages/ai/
    ├── knowledge-bases/
    │   ├── index.tsx
    │   ├── [id]/index.tsx
    │   ├── [id]/documents.tsx
    │   └── create.tsx
    ├── agents/
    │   ├── index.tsx
    │   ├── [id]/index.tsx
    │   └── create.tsx
    ├── chat/
    │   ├── index.tsx
    │   └── [sessionId].tsx
    └── audit/
        └── index.tsx
```

**每个文件控制在 300 行以内。** 超出时拆分逻辑。

---

## 二、错误定义

```typescript
// src/errors.ts
import { VentoStackError } from "@ventostack/core";

// 所有 AI 错误类统一支持 cause 链，与 WorkflowError 模式一致
export class AIGatewayError extends VentoStackError {
  readonly provider?: string;
  readonly model?: string;
  readonly cause?: Error;
  constructor(message: string, code: number, errorCode: string, opts?: {
    provider?: string; model?: string; cause?: Error;
  }) {
    super(message, code, errorCode);
    this.name = "AIGatewayError";
    if (opts?.provider) this.provider = opts.provider;
    if (opts?.model) this.model = opts.model;
    if (opts?.cause) this.cause = opts.cause;
  }
}

export class KnowledgeBaseError extends VentoStackError {
  readonly cause?: Error;
  constructor(message: string, code: number, errorCode: string, cause?: Error) {
    super(message, code, errorCode);
    this.name = "KnowledgeBaseError";
    if (cause) this.cause = cause;
  }
}

export class SandboxError extends VentoStackError {
  readonly cause?: Error;
  constructor(message: string, code: number, errorCode: string, cause?: Error) {
    super(message, code, errorCode);
    this.name = "SandboxError";
    if (cause) this.cause = cause;
  }
}

export class ToolExecutionError extends VentoStackError {
  readonly toolName?: string;
  readonly cause?: Error;
  constructor(message: string, code: number, errorCode: string, toolName?: string, cause?: Error) {
    super(message, code, errorCode);
    this.name = "ToolExecutionError";
    if (toolName) this.toolName = toolName;
    if (cause) this.cause = cause;
  }
}

export const aiErrors = {
  llmTimeout: (provider: string) =>
    new AIGatewayError("服务暂时不可用", 504, "AI_LLM_TIMEOUT", { provider }),
  llmRateLimited: (provider: string) =>
    new AIGatewayError("请求过于频繁", 429, "AI_LLM_RATE_LIMITED", { provider }),
  llmAllFailed: () =>
    new AIGatewayError("服务暂时不可用", 502, "AI_LLM_ALL_FAILED"),
  kbNotFound: () =>
    new KnowledgeBaseError("知识库不存在", 404, "AI_KB_NOT_FOUND"),
  kbIndexFailed: () =>
    new KnowledgeBaseError("索引构建失败", 500, "AI_KB_INDEX_FAILED"),
  sandboxTimeout: () =>
    new SandboxError("代码执行超时", 408, "AI_SANDBOX_TIMEOUT"),
  sandboxDenied: () =>
    new SandboxError("权限不足", 403, "AI_SANDBOX_DENIED"),
  toolNotFound: (name: string) =>
    new ToolExecutionError(`工具 ${name} 不存在`, 404, "AI_TOOL_NOT_FOUND", name),
  toolTimeout: (name: string) =>
    new ToolExecutionError(`工具 ${name} 执行超时`, 408, "AI_TOOL_TIMEOUT", name),
  toolApprovalRequired: (name: string) =>
    new ToolExecutionError(`工具 ${name} 需要审批`, 403, "AI_TOOL_APPROVAL_REQUIRED", name),
  promptInjection: () =>
    new AIGatewayError("检测到不安全的输入", 400, "AI_PROMPT_INJECTION"),
  maxIterationsExceeded: () =>
    new AIGatewayError("超过最大迭代次数", 400, "AI_MAX_ITERATIONS"),
  tokenBudgetExceeded: () =>
    new AIGatewayError("今日对话额度已用完", 429, "AI_TOKEN_BUDGET"),
  queueFull: () =>
    new AIGatewayError("请求队列已满，请稍后重试", 503, "AI_QUEUE_FULL"),
  queueTimeout: () =>
    new AIGatewayError("请求排队超时", 504, "AI_QUEUE_TIMEOUT"),
};
```

---

## 三、Model 层

### 3.1 ai_knowledge_base

```typescript
// src/models/knowledge-base.ts
import { column, defineModel } from "@ventostack/database";

export const AiKnowledgeBaseModel = defineModel("ai_knowledge_base", {
  id: column.varchar({ primary: true, length: 36 }),
  name: column.varchar({ length: 128 }),
  description: column.text({ nullable: true }),
  base_path: column.varchar({ length: 512 }),
  tenant_id: column.varchar({ length: 36 }),
  created_by: column.varchar({ length: 36 }),
  status: column.varchar({ length: 16, default: "active" }),
  document_count: column.int({ default: 0 }),
  created_at: column.timestamp({ default: "NOW" }),
  updated_at: column.timestamp({ default: "NOW" }),
}, { timestamps: true });
```

### 3.2 ai_document

```typescript
// src/models/document.ts
export const AiDocumentModel = defineModel("ai_document", {
  id: column.varchar({ primary: true, length: 36 }),
  knowledge_base_id: column.varchar({ length: 36 }),
  title: column.varchar({ length: 255 }),
  path: column.varchar({ length: 512 }),
  content: column.text(),
  frontmatter: column.json({ nullable: true }),
  links: column.json({ nullable: true }),
  tenant_id: column.varchar({ length: 36 }),
  created_by: column.varchar({ length: 36 }),
  created_at: column.timestamp({ default: "NOW" }),
  updated_at: column.timestamp({ default: "NOW" }),
}, { timestamps: true });
```

### 3.3 ai_agent

```typescript
// src/models/agent.ts
export const AiAgentModel = defineModel("ai_agent", {
  id: column.varchar({ primary: true, length: 36 }),
  name: column.varchar({ length: 128 }),
  description: column.text({ nullable: true }),
  avatar: column.varchar({ length: 512, nullable: true }),
  type: column.varchar({ length: 32, default: "chatbot" }),
  system_prompt: column.text(),
  model: column.varchar({ length: 64 }),
  tools: column.json({ nullable: true }),             // string[]
  knowledge_base_ids: column.json({ nullable: true }), // string[]
  memory_config: column.json({ nullable: true }),      // MemoryConfig
  config: column.json({ nullable: true }),             // AgentExtConfig
  max_iterations: column.int({ default: 10 }),
  max_tokens_per_turn: column.int({ default: 4096 }),
  tenant_id: column.varchar({ length: 36 }),
  created_by: column.varchar({ length: 36 }),
  status: column.varchar({ length: 16, default: "draft" }),
  is_public: column.boolean({ default: false }),
  created_at: column.timestamp({ default: "NOW" }),
  updated_at: column.timestamp({ default: "NOW" }),
}, { timestamps: true });
```

### 3.5 ai_conversation

```typescript
// src/models/conversation.ts
export const AiConversationModel = defineModel("ai_conversation", {
  id: column.varchar({ primary: true, length: 36 }),
  agent_id: column.varchar({ length: 36 }),
  user_id: column.varchar({ length: 36 }),
  title: column.varchar({ length: 255, nullable: true }),
  status: column.varchar({ length: 16, default: "active" }),
  agent_config_snapshot: column.json({ nullable: true }),
  metadata: column.json({ nullable: true }),
  tenant_id: column.varchar({ length: 36 }),
  created_at: column.timestamp({ default: "NOW" }),
  updated_at: column.timestamp({ default: "NOW" }),
}, { timestamps: true });
```

### 3.6 ai_message

```typescript
// src/models/message.ts
export const AiMessageModel = defineModel("ai_message", {
  id: column.varchar({ primary: true, length: 36 }),
  conversation_id: column.varchar({ length: 36 }),
  role: column.varchar({ length: 16 }),
  content: column.text({ nullable: true }),
  tool_calls: column.json({ nullable: true }),
  tool_call_id: column.varchar({ length: 128, nullable: true }),
  metadata: column.json({ nullable: true }),
  token_count: column.int({ default: 0 }),
  tenant_id: column.varchar({ length: 36 }),
  created_at: column.timestamp({ default: "NOW" }),
}, { timestamps: false });
```

### 3.7 ai_tool_log

```typescript
// src/models/tool-log.ts
export const AiToolLogModel = defineModel("ai_tool_log", {
  id: column.varchar({ primary: true, length: 36 }),
  conversation_id: column.varchar({ length: 36, nullable: true }),
  message_id: column.varchar({ length: 36, nullable: true }),
  tool_name: column.varchar({ length: 128 }),
  input: column.json({ nullable: true }),
  output: column.json({ nullable: true }),
  status: column.varchar({ length: 16 }),
  duration: column.int({ nullable: true }),
  user_id: column.varchar({ length: 36, nullable: true }),
  tenant_id: column.varchar({ length: 36 }),
  created_at: column.timestamp({ default: "NOW" }),
}, { timestamps: false });
```

### 3.8 ai_approval_request

```typescript
// src/models/approval.ts
export const AiApprovalRequestModel = defineModel("ai_approval_request", {
  id: column.varchar({ primary: true, length: 36 }),
  tool_name: column.varchar({ length: 128 }),
  input: column.json({ nullable: true }),
  requested_by: column.varchar({ length: 36 }),
  status: column.varchar({ length: 16, default: "pending" }),
  approved_by: column.varchar({ length: 36, nullable: true }),
  comment: column.text({ nullable: true }),
  expires_at: column.timestamp(),
  tenant_id: column.varchar({ length: 36 }),
  created_at: column.timestamp({ default: "NOW" }),
  updated_at: column.timestamp({ default: "NOW" }),
}, { timestamps: true });
```

### 3.9 ai_long_term_memory

```typescript
// src/models/long-term-memory.ts
export const AiLongTermMemoryModel = defineModel("ai_long_term_memory", {
  id: column.varchar({ primary: true, length: 36 }),
  user_id: column.varchar({ length: 36 }),
  key: column.varchar({ length: 128 }),
  value: column.text(),
  tenant_id: column.varchar({ length: 36 }),
  created_at: column.timestamp({ default: "NOW" }),
  updated_at: column.timestamp({ default: "NOW" }),
}, { timestamps: true });
```

---

## 四、迁移

```typescript
// src/migrations/003_create_ai_knowledge_tables.ts
import type { Migration } from "@ventostack/database";

export const createAiKnowledgeTables: Migration = {
  name: "003_create_ai_knowledge_tables",
  up: async (executor) => {
    // 无需 pgvector 扩展，LLM Wiki 模式
    await executor(`CREATE TABLE IF NOT EXISTS ai_knowledge_base (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(128) NOT NULL,
      description TEXT,
      base_path VARCHAR(512) NOT NULL,
      tenant_id VARCHAR(36) NOT NULL,
      created_by VARCHAR(36) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      document_count INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);

    await executor(`CREATE TABLE IF NOT EXISTS ai_document (
      id VARCHAR(36) PRIMARY KEY,
      knowledge_base_id VARCHAR(36) NOT NULL REFERENCES ai_knowledge_base(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      path VARCHAR(512) NOT NULL,
      content TEXT NOT NULL,
      frontmatter JSON,
      links JSON,
      tenant_id VARCHAR(36) NOT NULL,
      created_by VARCHAR(36) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);
    await executor(`CREATE INDEX IF NOT EXISTS idx_ai_doc_kb ON ai_document(knowledge_base_id, tenant_id)`);
    await executor(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_doc_path ON ai_document(knowledge_base_id, path)`);
    await executor(`CREATE INDEX IF NOT EXISTS idx_ai_doc_fts ON ai_document
      USING gin(to_tsvector('simple', title || ' ' || content))`);

    // ai_agent, ai_conversation, ai_message, ai_tool_log, ai_approval_request, ai_long_term_memory
    // ... 同上模式

    // 3. 审计表索引
    await executor(`CREATE INDEX IF NOT EXISTS idx_ai_tool_log_conv ON ai_tool_log(conversation_id)`);
    await executor(`CREATE INDEX IF NOT EXISTS idx_ai_tool_log_tool ON ai_tool_log(tool_name, tenant_id)`);
    await executor(`CREATE INDEX IF NOT EXISTS idx_ai_conv_user ON ai_conversation(user_id, agent_id, tenant_id)`);
    await executor(`CREATE INDEX IF NOT EXISTS idx_ai_msg_conv ON ai_message(conversation_id, created_at)`);
    await executor(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_ltm_user_key ON ai_long_term_memory(user_id, key, tenant_id)`);
  },
  down: async (executor) => {
    await executor("DROP TABLE IF EXISTS ai_document CASCADE");
    await executor("DROP TABLE IF EXISTS ai_knowledge_base CASCADE");
  },
};

// src/migrations/004_create_ai_agent_tables.ts
export const createAiAgentTables: Migration = {
  name: "004_create_ai_agent_tables",
  up: async (executor) => {
    await executor(`CREATE TABLE IF NOT EXISTS ai_agent (...)`);
    await executor(`CREATE TABLE IF NOT EXISTS ai_conversation (...)`);
    await executor(`CREATE TABLE IF NOT EXISTS ai_message (...)`);
    await executor(`CREATE TABLE IF NOT EXISTS ai_tool_log (...)`);
    await executor(`CREATE TABLE IF NOT EXISTS ai_approval_request (...)`);
    await executor(`CREATE TABLE IF NOT EXISTS ai_long_term_memory (...)`);
    // 索引
  },
  down: async (executor) => {
    await executor("DROP TABLE IF EXISTS ai_long_term_memory CASCADE");
    await executor("DROP TABLE IF EXISTS ai_approval_request CASCADE");
    await executor("DROP TABLE IF EXISTS ai_tool_log CASCADE");
    await executor("DROP TABLE IF EXISTS ai_message CASCADE");
    await executor("DROP TABLE IF EXISTS ai_conversation CASCADE");
    await executor("DROP TABLE IF EXISTS ai_agent CASCADE");
  },
};
```

---

## 五、LLM Gateway

### 5.1 类型定义（llm-gateway/types.ts）

```typescript
export interface LLMProvider {
  name: string;
  capabilities: ProviderCapabilities;
  chat(params: ChatParams): Promise<ChatResult>;
  chatStream(params: ChatParams): AsyncIterable<StreamChunk>;
  listModels(): Promise<ModelInfo[]>;
}

export interface ProviderCapabilities {
  functionCalling: boolean;
  maxContextLength: number;
  supportsVision: boolean;
  supportsStreaming: boolean;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatParams {
  model: string;
  messages: ChatMessage[];
  tools?: LLMToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ChatResult {
  content: string;
  toolCalls?: ToolCall[];
  usage: TokenUsage;
  finishReason: "stop" | "tool_calls" | "length" | "error";
}

export interface StreamChunk {
  type: "content" | "tool_call_start" | "tool_call_delta" | "usage" | "error" | "done";
  delta?: string;
  toolCall?: ToolCall;
  toolCallDelta?: { id?: string; name?: string; arguments?: string };
  usage?: TokenUsage;
  error?: { code: string; message: string; recoverable: boolean };
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextLength: number;
  supportsFunctionCalling: boolean;
  supportsVision: boolean;
}

export interface LLMGatewayConfig {
  providers: LLMProvider[];
  defaultModel: string;
  defaultProvider?: string;
  maxConcurrent?: number;      // 默认 10
  maxQueued?: number;          // 默认 100
  queueTimeoutMs?: number;     // 默认 30000
}

export interface LLMGateway {
  chat(params: ChatParams): Promise<ChatResult>;
  chatStream(params: ChatParams): AsyncIterable<StreamChunk>;
  getProvider(name: string): LLMProvider | undefined;
  getDefaultProvider(): LLMProvider;
  listProviders(): LLMProvider[];
}
```

### 5.2 重试（llm-gateway/retry.ts）

```typescript
export interface RetryConfig {
  maxRetries: number;           // 默认 3
  baseDelayMs: number;          // 默认 1000
  maxDelayMs: number;           // 默认 30000
  jitterFactor: number;         // 默认 0.1
  retryableStatusCodes: number[]; // 默认 [429, 500, 502, 503, 504]
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config?: Partial<RetryConfig>,
): Promise<T>;

// 实现：指数退避 + jitter + 429 Retry-After header 支持
// sleep 用 setTimeout，不用 Bun.sleep（保持与测试 mock 兼容）
```

### 5.3 并发队列（llm-gateway/queue.ts）

```typescript
export interface QueueConfig {
  maxConcurrent: number;    // 默认 10
  maxQueued: number;        // 默认 100
  queueTimeoutMs: number;   // 默认 30000
}

export interface RequestQueue {
  acquire(): Promise<void>;   // 超限则排队或抛 queueFull/queueTimeout
  release(): void;
}

export function createRequestQueue(config: QueueConfig): RequestQueue;

// 实现：active 计数器 + Promise 队列
// acquire: active < max → active++；否则排队
// release: active--，队列有等待则唤醒
```

### 5.4 OpenAI Provider（llm-gateway/providers/openai.ts）

```typescript
export interface OpenAIProviderConfig {
  apiKey: string;
  baseUrl?: string;    // 默认 "https://api.openai.com/v1"
}

export function createOpenAIProvider(config: OpenAIProviderConfig): LLMProvider;

// chat(): POST /chat/completions, stream=false
// chatStream(): POST /chat/completions, stream=true, stream_options.include_usage=true
// SSE 解析：data: [DONE] 结束，增量处理 content / tool_calls / usage
// tool_calls 增量拼接：id → name → arguments delta → 最终 JSON.parse
```

### 5.5 Anthropic Provider（llm-gateway/providers/anthropic.ts）

```typescript
export interface AnthropicProviderConfig {
  apiKey: string;
  baseUrl?: string;    // 默认 "https://api.anthropic.com"
}

export function createAnthropicProvider(config: AnthropicProviderConfig): LLMProvider;

// 关键差异：
// 1. POST /v1/messages（非 /chat/completions）
// 2. system 是顶层参数，不在 messages 中
// 3. max_tokens 是必填参数
// 4. 流式事件格式：content_block_delta / message_delta / message_stop
// 5. tool_use 是 content_block 类型
// 6. Header: x-api-key + anthropic-version: 2023-06-01
```

### 5.6 Gateway 工厂（llm-gateway/gateway.ts）

```typescript
export function createLLMGateway(config: LLMGatewayConfig): LLMGateway;

// 实现：
// 1. 创建 RequestQueue
// 2. chat/chatStream: 选择 provider → acquire → withRetry(provider.chat) → release
// 3. 降级：主 provider 失败 → 尝试备用 provider
// 4. 全部失败 → throw aiErrors.llmAllFailed()
```

### 5.7 旧接口适配

```typescript
// llm-gateway/adapter.ts
import type { LLMClient } from "../llm"; // 旧接口

export function createLLMClientAdapter(gateway: LLMGateway): LLMClient;
// 实现：调用 gateway.chat()，返回 result.content
```

---

## 六、知识库系统

### 6.1 租户隔离（knowledge-base/tenant-query.ts）

```typescript
import type { Database } from "@ventostack/database";

// 泛型接口，避免 unknown 滥用
export interface TenantQuery {
  db: Database;
  tenantId: string;

  // 自动追加 WHERE tenant_id = $tenantId
  select<T>(table: string, conditions?: Record<string, unknown>): Promise<T[]>;
  selectOne<T>(table: string, conditions?: Record<string, unknown>): Promise<T | null>;
  insert(table: string, data: Record<string, unknown>): Promise<void>;
  update(table: string, data: Record<string, unknown>, conditions: Record<string, unknown>): Promise<void>;
  delete(table: string, conditions: Record<string, unknown>): Promise<void>;
  count(table: string, conditions?: Record<string, unknown>): Promise<number>;
  // 注意：不暴露 raw() 方法，防止绕过 tenant_id 过滤
}

export function createTenantQuery(db: Database, tenantId: string): TenantQuery;
```

### 6.2 Markdown 解析器（knowledge-base/markdown-parser.ts）

```typescript
export interface ParsedMarkdown {
  frontmatter: Record<string, string>;
  body: string;
  links: string[];  // 提取的 [[wiki link]] 目标
}

// 解析 YAML frontmatter + 提取 [[wiki links]]
export function parseMarkdown(content: string): ParsedMarkdown;

// 提取 [[link]] 形式的引用
export function extractWikiLinks(content: string): string[];
```

### 6.3 文件安全（knowledge-base/file-security.ts）

```typescript
export interface FileSecurityConfig {
  maxFileSize: number;        // 默认 10MB
  maxFilesPerKB: number;      // 默认 1000
  allowedExtensions: string[]; // 默认 [".md", ".txt"]
}

export interface FileValidator {
  validateFile(file: { name: string; size: number }): { valid: boolean; error?: string };
  sanitizePath(path: string): string;  // 防止路径穿越
  sanitizeFileName(name: string): string;
}

export function createFileValidator(config?: Partial<FileSecurityConfig>): FileValidator;
```

### 6.4 知识库服务（knowledge-base/service.ts）

```typescript
export interface KnowledgeBaseService {
  // 知识库 CRUD
  create(params: { name: string; description?: string; basePath: string; tenantId: string; userId: string }): Promise<{ id: string }>;
  getById(id: string, tenantId: string): Promise<KnowledgeBase | null>;
  list(params: { tenantId: string; page?: number; pageSize?: number }): Promise<{ list: KnowledgeBase[]; total: number }>;
  delete(id: string, tenantId: string): Promise<void>;

  // 文档 CRUD
  createDocument(params: { kbId: string; title: string; path: string; content: string; tenantId: string; userId: string }): Promise<{ id: string }>;
  getDocument(docId: string, tenantId: string): Promise<KDocument | null>;
  updateDocument(docId: string, params: { content?: string; title?: string }, tenantId: string): Promise<void>;
  deleteDocument(docId: string, tenantId: string): Promise<void>;
  listDocuments(kbId: string, params?: { tenantId: string; page?: number; pageSize?: number }): Promise<{ list: KDocument[]; total: number }>;

  // 文件系统操作（供 LLM 工具调用）
  browseDirectory(kbId: string, path: string, depth: number, tenantId: string): Promise<FileEntry[]>;
  readFile(kbId: string, path: string, tenantId: string): Promise<KDocument | null>;
  searchFiles(kbId: string, query: string, tenantId: string, limit?: number): Promise<SearchResult[]>;
  followLink(kbId: string, link: string, tenantId: string): Promise<KDocument | null>;
}

export function createKnowledgeBaseService(deps: KnowledgeBaseServiceDeps): KnowledgeBaseService;

// createDocument 流程（LLM Wiki 模式，无分块/Embedding）：
// 1. 文件安全校验（大小、扩展名、路径穿越）
// 2. 解析 Markdown（frontmatter + wiki links）
// 3. 事务性写入 ai_document（含 content、frontmatter、links）
// 4. 更新 ai_knowledge_base.document_count

// searchFiles 实现（PostgreSQL 全文搜索）：
// SQL: SELECT id, title, path,
//      ts_headline('simple', content, plainto_tsquery('simple', $1)) as excerpt,
//      ts_rank(to_tsvector('simple', title || ' ' || content), plainto_tsquery('simple', $1)) as score
//      FROM ai_document
//      WHERE knowledge_base_id = $2 AND tenant_id = $3
//        AND to_tsvector('simple', title || ' ' || content) @@ plainto_tsquery('simple', $1)
//      ORDER BY score DESC LIMIT $4
```

---

## 七、Agent 引擎

### 7.1 Prompt Guard（agent-engine/prompt-guard.ts）

```typescript
export interface PromptGuardConfig {
  enabled: boolean;
  maxInputLength?: number;     // 默认 10000
  blockSystemPromptLeak?: boolean; // 默认 true
}

export interface PromptGuardResult {
  safe: boolean;
  level: "safe" | "warning" | "blocked";
  reason?: string;
}

export interface PromptGuard {
  checkInput(message: string): PromptGuardResult;
  checkOutput(output: string, systemPrompt: string): PromptGuardResult;
}

export function createPromptGuard(config: PromptGuardConfig): PromptGuard;

// checkInput 实现：
// 1. Unicode 规范化（NFKC）
// 2. 零宽字符移除
// 3. 特殊字符密度检查（>30% 则 warning）
// 4. 关键词检测（中英文 + 多语言变体）
// 5. level: safe / warning / blocked

// checkOutput 实现：
// 1. 检测 system prompt 原文片段（>50 字符匹配）
// 2. 检测语义摘要泄露模式（"我的指令是"、"我被设定为"）
```

### 7.2 消息组装（agent-engine/prompt-builder.ts）

```typescript
export interface TokenBudget {
  maxPromptTokens: number;      // 默认 128000
  maxCompletionTokens: number;  // 默认 4096
  reservedForContext: number;   // 默认 4000
}

export function fitMessagesToBudget(
  messages: ChatMessage[],
  systemPrompt: string,
  budget: TokenBudget,
): ChatMessage[];

export function formatKBContext(results: RetrieveResult[]): string;

// formatKBContext：用 XML 标签包裹
// <retrieved_context source="doc_id" confidence="0.85">
// ...内容...
// </retrieved_context>
```

### 7.3 工具调用处理（agent-engine/tool-call-handler.ts）

```typescript
export function parseToolCalls(
  toolCalls: ToolCall[],
  registry: ToolRegistry,
): Array<{ name: string; params: Record<string, unknown>; id: string; error?: string }>;

export function attemptJSONRepair(raw: string): Record<string, unknown>;

// attemptJSONRepair：
// 1. 去除 markdown 代码块标记
// 2. 修复尾部逗号
// 3. 修复单引号 → 双引号
```

### 7.4 Agent 循环（agent-engine/agent-loop.ts）

```typescript
export interface AgentConfig {
  id: string;
  name: string;
  systemPrompt: string;
  model: string;
  tools?: string[];
  knowledgeBaseIds?: string[];
  memory?: MemoryConfig;
  maxIterations?: number;      // 默认 10
  maxTokensPerTurn?: number;   // 默认 4096
  temperature?: number;
  tenantId: string;
}

export interface AgentLoopDeps {
  llmGateway: LLMGateway;
  toolRegistry?: ToolRegistry;
  knowledgeBase?: KnowledgeBaseService;
  memory?: MemoryService;
  codeSandbox?: CodeSandbox;
  eventBus?: EventBus;
  notificationService?: NotificationService;
  promptGuard?: PromptGuard;
  cache?: Cache;
}

export interface AgentLoop {
  runStream(params: AgentRunParams): AsyncIterable<StreamChunk>;
}

export interface AgentRunParams {
  agentId: string;
  userId: string;
  sessionId?: string;
  message: string;
  tenantId: string;
  signal?: AbortSignal;
}

export function createAgentLoop(deps: AgentLoopDeps): AgentLoop;

// runStream 实现（AsyncGenerator）：
// 1. Redis 分布式锁：acquire lock:{conversationId}
// 2. 快照 Agent 配置
// 3. 加载对话历史（Memory）→ 失败则空历史
// 4. PromptGuard.checkInput → blocked 则 throw aiErrors.promptInjection()
// 5. 检索知识库 → PromptGuard.checkOutput(检索结果) → XML 标签包裹
// 6. 组装 messages
// 7. fitMessagesToBudget()
// 8. while (iteration < maxIterations):
//    a. llmGateway.chatStream() → yield content/tool_call chunks
//    b. if tool_calls:
//       - parseToolCalls()
//       - Tool Policy 权限校验
//       - 需审批 → 创建 ai_approval_request → yield waiting_approval chunk → 等待（异步）
//       - 执行工具（超时 30s，结果截断 2000 tokens）
//       - 工具错误 → 结构化错误追加到 messages
//    c. if stop: break
// 9. 保存对话到 Memory
// 10. 释放 Redis 锁
// 11. yield done
```

---

## 八、记忆系统

```typescript
// src/memory/service.ts

export interface MemoryService {
  // 对话记忆
  getHistory(sessionId: string, limit?: number): Promise<ChatMessage[]>;
  appendMessage(sessionId: string, message: ChatMessage): Promise<void>;
  createSession(userId: string, agentId: string, agentConfig: AgentConfig): Promise<string>;
  listSessions(userId: string, agentId: string): Promise<SessionInfo[]>;
  deleteSession(sessionId: string): Promise<void>;

  // 长期记忆
  getLongTermMemory(userId: string, key: string, tenantId: string): Promise<string | null>;
  setLongTermMemory(userId: string, key: string, value: string, tenantId: string): Promise<void>;
  searchLongTermMemory(userId: string, query: string, tenantId: string, topK?: number): Promise<LongTermMemory[]>;
  deleteLongTermMemory(userId: string, key: string, tenantId: string): Promise<void>;
}

export function createMemoryService(deps: { db: Database; cache?: Cache }): MemoryService;

// 实现：
// getHistory: SELECT * FROM ai_message WHERE conversation_id = $1 ORDER BY created_at
// appendMessage: INSERT INTO ai_message（token_count 使用 LLM 返回的 usage）
// createSession: INSERT INTO ai_conversation（含 agent_config_snapshot）
// getLongTermMemory: SELECT value FROM ai_long_term_memory WHERE user_id=$1 AND key=$2 AND tenant_id=$3
// setLongTermMemory: INSERT ... ON CONFLICT (user_id, key, tenant_id) DO UPDATE SET value=$4
// 缓存：最近 N 条消息缓存到 Redis，新消息写入时清除
```

---

## 九、代码沙盒

```typescript
// src/code-sandbox/types.ts

export interface CodeSandboxConfig {
  type: "process" | "docker";
  timeout: number;           // 默认 30000ms
  memoryLimit?: string;      // Docker: "256m"
  networkAccess: boolean;    // 默认 false
  maxOutputSize: number;     // 默认 1MB
}

export interface CodeExecution {
  id: string;
  status: "completed" | "timeout" | "error";
  stdout: string;
  stderr: string;
  exitCode: number | null;
  duration: number;
}

export interface CodeSandbox {
  execute(code: string): Promise<CodeExecution>;
  destroy(): Promise<void>;
}

// src/code-sandbox/process.ts
export function createProcessSandbox(config: CodeSandboxConfig): CodeSandbox;

// execute 实现：
// 1. tmpDir = `${Bun.tmpdir()}/sandbox_${crypto.randomUUID()}`
// 2. mkdir -p tmpDir
// 3. tmpFile = `${tmpDir}/main.ts`
// 4. Bun.write(tmpFile, code)
// 5. proc = Bun.spawn(["bun", "run", "--no-permission", tmpFile], {
//      timeout, env: { PATH, HOME: tmpDir }, stdout: "pipe", stderr: "pipe"
//    })
// 6. 读取 stdout/stderr，限制 maxOutputSize
// 7. await proc.exited
// 8. finally: rm -rf tmpDir
```

---

## 十、流式引擎

```typescript
// src/stream-engine/sse.ts

export interface StreamOptions {
  signal?: AbortSignal;
  heartbeatIntervalMs?: number;  // 默认 15000
}

export function createSSEResponse(
  stream: AsyncIterable<StreamChunk>,
  options?: StreamOptions,
): Response;

// 实现：
// 1. ReadableStream + TextEncoder
// 2. 遍历 stream，每个 chunk 序列化为 `data: ${JSON.stringify(chunk)}\n\n`
// 3. 心跳：每 15s 发送 `: heartbeat\n\n`
// 4. signal abort 时关闭 stream
// 5. Content-Type: text/event-stream, Cache-Control: no-cache, Connection: keep-alive
```

---

## 十一、内置工具

### 11.1 知识库浏览工具（tools/kb-browse.ts）

```typescript
export function createKBBrowseTool(kbService: KnowledgeBaseService): Tool;
// 功能：列出知识库的目录结构
// 入参：{ kbId, path?: string, depth?: number }
// 返回：FileEntry[] 目录树
```

### 11.2 知识库文件读取工具（tools/kb-read.ts）

```typescript
export function createKBReadTool(kbService: KnowledgeBaseService): Tool;
// 功能：读取指定文件的完整内容
// 入参：{ kbId, path: string }
// 返回：{ title, content, frontmatter, links }
```

### 11.3 知识库搜索工具（tools/kb-search.ts）

```typescript
export function createKBSearchTool(kbService: KnowledgeBaseService): Tool;
// 功能：按关键词搜索文件（PostgreSQL 全文搜索）
// 入参：{ kbId, query: string, limit?: number }
// 返回：{ path, title, excerpt, score }[]
```

### 11.4 知识库 wiki link 追踪工具（tools/kb-follow-link.ts）

```typescript
export function createKBFollowLinkTool(kbService: KnowledgeBaseService): Tool;
// 功能：追踪 [[wiki link]] 引用，读取目标文件
// 入参：{ kbId, link: string }
// 返回：{ title, content, path }
```

### 11.5 计算器工具（tools/calculator.ts）

```typescript
export function createCalculatorTool(): Tool;

// handler: 安全数学表达式求值（不使用 eval）
// 支持：+、-、*、/、**、%、()
```

---

## 十二、Service 层

### 12.1 知识库 CRUD 服务（services/knowledge-base.ts）

```typescript
// 知识库依赖类型（LLM Wiki 模式，无 Embedding/Vector）
export interface KnowledgeBaseServiceDeps {
  db: Database;
  cache?: Cache;
  eventBus?: EventBus;
}

export function createKnowledgeBaseCrudService(deps: KnowledgeBaseServiceDeps): {
  create(params: { name: string; description?: string; basePath: string; tenantId: string; userId: string }): Promise<{ id: string }>;
  getById(id: string, tenantId: string): Promise<KnowledgeBase | null>;
  list(params: { tenantId: string; page?: number; pageSize?: number }): Promise<{ list: KnowledgeBase[]; total: number }>;
  delete(id: string, tenantId: string): Promise<void>;

  // 文档管理
  createDocument(params: { kbId: string; title: string; path: string; content: string; tenantId: string; userId: string }): Promise<{ id: string }>;
  getDocument(docId: string, tenantId: string): Promise<KDocument | null>;
  updateDocument(docId: string, params: { content?: string; title?: string }, tenantId: string): Promise<void>;
  deleteDocument(docId: string, tenantId: string): Promise<void>;
  listDocuments(kbId: string, params?: { tenantId: string; page?: number; pageSize?: number }): Promise<{ list: KDocument[]; total: number }>;

  // 文件系统操作（供 LLM 工具调用）
  browseDirectory(kbId: string, path: string, depth: number, tenantId: string): Promise<FileEntry[]>;
  readFile(kbId: string, path: string, tenantId: string): Promise<KDocument | null>;
  searchFiles(kbId: string, query: string, tenantId: string, limit?: number): Promise<SearchResult[]>;
  followLink(kbId: string, link: string, tenantId: string): Promise<KDocument | null>;
};

// 所有查询强制 tenant_id 过滤
```

### 12.2 Agent CRUD 服务（services/agent.ts）

```typescript
export function createAgentCrudService(deps: { db: Database }): {
  create(params: CreateAgentParams): Promise<{ id: string }>;
  getById(id: string, tenantId: string): Promise<Agent | null>;
  list(params: { tenantId: string; userId: string; isAdmin: boolean }): Promise<{ list: Agent[]; total: number }>;
  update(id: string, params: Partial<Agent>, tenantId: string): Promise<void>;
  delete(id: string, tenantId: string): Promise<void>;
  publish(id: string, tenantId: string): Promise<void>;
  disable(id: string, tenantId: string): Promise<void>;
};

// list: 管理员看租户内全部，普通用户看 is_public=true 或 created_by=userId
```

### 12.3 对话服务（services/conversation.ts）

```typescript
export function createConversationService(deps: { db: Database }): {
  create(params: { agentId: string; userId: string; tenantId: string; agentConfig: AgentConfig }): Promise<{ id: string }>;
  getById(id: string, userId: string): Promise<Conversation | null>;
  list(params: { userId: string; agentId?: string; tenantId: string }): Promise<Conversation[]>;
  delete(id: string, userId: string): Promise<void>;
};

// create: INSERT 含 agent_config_snapshot
```

### 12.4 审批服务（services/approval.ts）

```typescript
// 与现有 ApprovalManager 接口对齐，新增数据库持久化
export interface ApprovalService {
  request(toolName: string, params: Record<string, unknown>, requestedBy: string, tenantId: string): Promise<ApprovalRequest>;
  approve(id: string, reviewedBy: string, reason?: string): Promise<ApprovalRequest | null>;
  reject(id: string, reviewedBy: string, reason?: string): Promise<ApprovalRequest | null>;
  getStatus(id: string): Promise<ApprovalRequest | null>;
  listPending(tenantId: string): Promise<ApprovalRequest[]>;
  cleanup(): Promise<number>;
}

export function createApprovalService(deps: { db: Database; eventBus?: EventBus }): ApprovalService;

// request: INSERT + expires_at = NOW() + 5 minutes
// approve/reject: UPDATE status + eventBus.emit
// cleanup: DELETE WHERE status = 'pending' AND expires_at < NOW()
```

---

## 十三、Route 层

### 13.1 路由文件结构

每个路由文件导出工厂函数，接收 service + authMiddleware + perm。

```typescript
// src/routes/knowledge-base.ts
export function createKnowledgeBaseRoutes(
  deps: { kbService: KnowledgeBaseService; crudService: CrudService; authMiddleware: Middleware; perm: PermFunction },
): Router;

// POST   /api/ai/knowledge-bases          → perm("ai:knowledge-base", "create")
// GET    /api/ai/knowledge-bases          → perm("ai:knowledge-base", "list")
// GET    /api/ai/knowledge-bases/:id      → perm("ai:knowledge-base", "list")
// PUT    /api/ai/knowledge-bases/:id      → perm("ai:knowledge-base", "update")
// DELETE /api/ai/knowledge-bases/:id      → perm("ai:knowledge-base", "delete")
// POST   /api/ai/knowledge-bases/:id/documents → perm("ai:document", "import")
// GET    /api/ai/knowledge-bases/:id/documents → perm("ai:knowledge-base", "list")
// DELETE /api/ai/knowledge-bases/:id/documents/:docId → perm("ai:knowledge-base", "delete")
```

### 13.2 对话交互路由（routes/chat.ts）

```typescript
export function createChatRoutes(deps: {
  agentLoop: AgentLoop;
  conversationService: ConversationService;
  authMiddleware: Middleware;
  perm: PermFunction;
}): Router;

// POST /api/ai/chat        → 非流式（collectStream）
// POST /api/ai/chat/stream → SSE 流式（createSSEResponse）

// POST /api/ai/chat/stream 实现：
// 1. 从 Authorization header 验证 token
// 2. 解析 body: { agentId, message, sessionId? }
// 3. 如果无 sessionId → conversationService.create()
// 4. agentLoop.runStream({ agentId, userId, sessionId, message, tenantId, signal })
// 5. createSSEResponse(stream, { signal })
// 6. AbortSignal 连接 request.signal
```

### 13.3 响应封装

```typescript
// src/routes/common.ts
// 复用现有 ok / okPage / fail 模式

// 新增：handleAIError
export function handleAIError(e: unknown): Response {
  if (e instanceof AIGatewayError || e instanceof KnowledgeBaseError ||
      e instanceof SandboxError || e instanceof ToolExecutionError) {
    return fail(e.message, e.code);
  }
  return fail("服务器内部错误", 500);
}
```

---

## 十四、Module 层

```typescript
// src/module.ts
export interface AIModule {
  services: {
    knowledgeBase: KnowledgeBaseService;
    agent: AgentCrudService;
    conversation: ConversationService;
    agentLoop: AgentLoop;
    approval: ApprovalService;
  };
  router: Router;
  init(): Promise<void>;
}

export interface AIModuleDeps {
  db: Database;
  cache?: Cache;
  jwt: JWTManager;
  jwtSecret: string;
  rbac?: RBAC;
  eventBus: EventBus;
  auditStore?: AuditStore;
  notification?: NotificationService;
  llmProviders: LLMProviderConfig[];
  defaultModel: string;
}

export function createAIModule(deps: AIModuleDeps): AIModule;
```

---

## 十五、补充：评审意见修正

### 15.1 审批路由（routes/approval.ts）

```typescript
export function createApprovalRoutes(deps: {
  approvalService: ApprovalService;
  authMiddleware: Middleware;
  perm: PermFunction;
}): Router;

// GET    /api/ai/approvals              → perm("ai:approval", "list") 列出待审批
// GET    /api/ai/approvals/:id          → perm("ai:approval", "list") 查看详情
// POST   /api/ai/approvals/:id/approve  → perm("ai:approval", "approve") 批准
// POST   /api/ai/approvals/:id/reject   → perm("ai:approval", "reject") 拒绝
```

### 15.2 健康检查路由（routes/health.ts）

```typescript
export function createHealthRoutes(deps: {
  llmGateway: LLMGateway;
  vectorStore: VectorStore;
  authMiddleware?: Middleware;  // 详细信息需认证
}): Router;

// GET /api/ai/healthz → 公开，返回 {"status":"ok"}
// GET /api/ai/health  → 需认证，返回各组件状态
```

### 15.3 Redis 分布式锁实现

```typescript
// packages/platform/ai/src/agent-engine/distributed-lock.ts

export interface DistributedLock {
  acquire(key: string, ttlMs?: number): Promise<boolean>;
  release(key: string): Promise<void>;
  withLock<T>(key: string, fn: () => Promise<T>, ttlMs?: number): Promise<T>;
}

export function createDistributedLock(cache: Cache): DistributedLock;

// 实现：SET key value NX PX ttlMs
// value = crypto.randomUUID()（防止误释放他人锁）
// release: 用 Lua 脚本原子校验 value 后 DELETE
// withLock: acquire → fn() → finally release
// 默认 TTL 60s，防止死锁
```

### 15.4 Token 限流实现

```typescript
// packages/platform/ai/src/agent-engine/token-budget.ts

export interface TokenBudgetConfig {
  perUserDaily: number;       // 默认 100000
  perConversationTurns: number; // 默认 50
}

export interface TokenBudgetChecker {
  check(userId: string, tenantId: string): Promise<{ allowed: boolean; remaining: number }>;
  consume(userId: string, tenantId: string, tokens: number): Promise<void>;
}

export function createTokenBudgetChecker(deps: { cache: Cache; config?: Partial<TokenBudgetConfig> }): TokenBudgetChecker;

// 实现：
// check: GET ai:token:{userId}:{date} → 是否超过 perUserDaily
// consume: INCRBY ai:token:{userId}:{date} {tokens} + EXPIRE 86400
// 超限时抛 aiErrors.tokenBudgetExceeded()
```

### 15.5 SSE 连接限制

```typescript
// packages/platform/ai/src/stream-engine/connection-limiter.ts

export interface ConnectionLimiter {
  acquire(userId: string): Promise<boolean>;  // 超限返回 false
  release(userId: string): Promise<void>;
}

export function createConnectionLimiter(deps: { cache: Cache; maxPerUser?: number }): ConnectionLimiter;

// 实现：
// acquire: INCR ai:sse:{userId} → 检查是否 > maxPerUser(5)
// release: DECR ai:sse:{userId}
// 连接断开时在 finally 中调用 release
```

### 15.6 缓存策略实现

```typescript
// packages/platform/ai/src/cache/ai-cache.ts

export interface AICache {
  // 知识库搜索缓存
  getSearchResult(kbId: string, queryHash: string): Promise<SearchResult[] | null>;
  setSearchResult(kbId: string, queryHash: string, results: SearchResult[]): Promise<void>;  // TTL 5min

  // 知识库检索缓存
  getSearchResult(kbId: string, queryHash: string): Promise<RetrieveResult[] | null>;
  setSearchResult(kbId: string, queryHash: string, results: RetrieveResult[]): Promise<void>;  // TTL 5min
  invalidateSearchCache(kbId: string): Promise<void>;  // 文档变更时调用

  // Agent 配置缓存（内存 Map + TTL 5min）
  getAgentConfig(agentId: string): Promise<AgentConfig | null>;
  setAgentConfig(agentId: string, config: AgentConfig): Promise<void>;
  invalidateAgentConfig(agentId: string): Promise<void>;
}

export function createAICache(cache: Cache): AICache;

// Key 格式：
// ai:kb:{kbId}:search:{sha256(query)} → search results JSON
// ai:kb:{kbId}:search:{sha256(query)} → results JSON
// ai:agent:{agentId}:config → agent config JSON（内存 Map）
```

### 15.7 文件安全校验

```typescript
// packages/platform/ai/src/knowledge-base/file-security.ts

export interface FileSecurityConfig {
  maxFileSize: number;        // 默认 10 * 1024 * 1024 (10MB)
  maxKnowledgeBaseSize: number; // 默认 1024 * 1024 * 1024 (1GB)
  allowedMimeTypes: string[];  // 默认 ["text/markdown", "text/plain"]
  allowedExtensions: string[]; // 默认 [".md", ".mdx", ".txt"]
}

export interface FileValidator {
  validateFile(file: { name: string; size: number; type: string; content: Buffer }): ValidationResult;
  sanitizeFileName(name: string): string;  // 只保留 [a-zA-Z0-9._-]
  checkMagicBytes(content: Buffer, expectedType: string): boolean;
}

export function createFileValidator(config?: Partial<FileSecurityConfig>): FileValidator;
```

### 15.8 迁移文件拆分

迁移拆分为两个文件，避免单文件超 300 行：

- `migrations/003_create_ai_knowledge_tables.ts` — ai_knowledge_base + ai_document（LLM Wiki 模式）
- `migrations/004_create_ai_agent_tables.ts` — ai_agent + ai_conversation + ai_message + ai_tool_log + ai_approval_request + ai_long_term_memory

### 15.9 Mock 策略更新

```typescript
// __tests__/helpers.ts

// 复用现有 createMockDatabase 模式
export function createMockDatabase(exec?: MockFunction): { db: Database; exec: MockFunction };

// LLM Mock
export function createMockLLMProvider(responses: ChatResult[]): LLMProvider;

// KnowledgeBase Mock
export function createMockKnowledgeBaseService(): KnowledgeBaseService;

// SSE 流式 Mock
export async function* createMockStream(chunks: StreamChunk[]): AsyncIterable<StreamChunk>;

// Cache Mock（内存 Map）
export function createMockCache(): Cache;
```

---

## 十六、测试策略

### 16.1 测试覆盖要求

| 模块 | 测试文件 | 用例数目标 |
|------|---------|-----------|
| llm-gateway | gateway.test.ts, retry.test.ts, queue.test.ts | ~20 |
| knowledge-base | service.test.ts, file-security.test.ts, markdown-parser.test.ts | ~15 |
| agent-engine | agent-loop.test.ts, prompt-builder.test.ts, prompt-guard.test.ts, tool-call-handler.test.ts, token-budget.test.ts, distributed-lock.test.ts | ~30 |
| memory | service.test.ts | ~10 |
| code-sandbox | process.test.ts | ~8 |
| stream-engine | sse.test.ts, connection-limiter.test.ts | ~10 |
| cache | ai-cache.test.ts | ~8 |
| services | knowledge-base.test.ts, agent.test.ts, conversation.test.ts, approval.test.ts | ~20 |
| routes | knowledge-base.test.ts, agent.test.ts, chat.test.ts, conversation.test.ts, approval.test.ts, health.test.ts | ~20 |
| **合计** | | **~151** |

### 15.2 测试覆盖要求

| 模块 | 测试文件 | 用例数目标 |
|------|---------|-----------|
| llm-gateway | gateway.test.ts, retry.test.ts, queue.test.ts | ~20 |
| knowledge-base | service.test.ts, file-security.test.ts, markdown-parser.test.ts | ~15 |
| agent-engine | agent-loop.test.ts, prompt-builder.test.ts, prompt-guard.test.ts, tool-call-handler.test.ts | ~20 |
| memory | service.test.ts | ~10 |
| code-sandbox | process.test.ts | ~8 |
| services | knowledge-base.test.ts, agent.test.ts, conversation.test.ts, approval.test.ts | ~20 |
| routes | knowledge-base.test.ts, agent.test.ts, chat.test.ts, conversation.test.ts | ~15 |
| **合计** | | **~118** |

---

## 十六、实施顺序（精确到文件）

### MVP-A（W1-W2）：LLM + 流式 + 对话

| 天 | 文件 | 说明 |
|----|------|------|
| D1 | `errors.ts`, `llm-gateway/types.ts` | 类型基础 |
| D1 | `llm-gateway/retry.ts` + test | 重试策略 |
| D1 | `llm-gateway/queue.ts` + test | 并发队列 |
| D2 | `llm-gateway/providers/openai.ts` + test | OpenAI 流式 |
| D2 | `llm-gateway/gateway.ts` + test | Gateway 工厂 |
| D2 | `llm-gateway/adapter.ts` | 旧接口适配 |
| D3 | `stream-engine/sse.ts` + test | SSE 响应 |
| D3 | `agent-engine/prompt-builder.ts` + test | 消息组装 |
| D3 | `agent-engine/prompt-guard.ts` + test | 注入防护 |
| D4 | `agent-engine/tool-call-handler.ts` + test | 工具调用解析 |
| D4 | `agent-engine/distributed-lock.ts` + test | 分布式锁 |
| D4 | `agent-engine/token-budget.ts` + test | Token 限流 |
| D5 | `agent-engine/agent-loop.ts` (基础版，无工具) | Agent 循环 |
| D5 | `stream-engine/connection-limiter.ts` + test | SSE 连接限制 |
| D5 | `cache/ai-cache.ts` + test | 缓存策略 |
| D5 | `routes/chat.ts` + test | 对话路由 |
| D5 | 前端 `sse-client.ts` + `chat/[sessionId].tsx` | 对话页面 |

### MVP-B（W3-W4）：知识库 + CRUD + 权限

| 天 | 文件 | 说明 |
|----|------|------|
| D6 | `migrations/003_*.ts`, `004_*.ts` | 数据库迁移（拆分两个） |
| D6 | `models/*.ts` (全部 9 个) | 数据模型 |
| D7 | `knowledge-base/tenant-query.ts` | 租户隔离 |
| D7 | `knowledge-base/service.ts` + test | 知识库服务（文件管理） |
| D7 | `knowledge-base/file-security.ts` + test | 文件安全校验 |
| D7 | `knowledge-base/markdown-parser.ts` + test | Markdown 解析 |
| D8 | `tools/kb-browse.ts`, `tools/kb-read.ts` | 知识库浏览/读取工具 |
| D8 | `tools/kb-search.ts`, `tools/kb-follow-link.ts` | 知识库搜索/链接工具 |
| D9 | `knowledge-base/service.ts` + test | 知识库服务 |
| D9 | `services/knowledge-base.ts`, `services/agent.ts` | CRUD 服务 |
| D9 | `services/conversation.ts`, `services/approval.ts` | 对话/审批服务 |
| D10 | `routes/knowledge-base.ts`, `routes/agent.ts`, `routes/conversation.ts` | CRUD 路由 |
| D10 | `routes/approval.ts`, `routes/health.ts` | 审批 + 健康检查路由 |
| D10 | `middlewares/auth-guard.ts` | 权限中间件 |
| D10 | `module.ts`, `index.ts` | 模块聚合 |

### MVP-B 后续（前端 + 集成）

| 天 | 文件 | 说明 |
|----|------|------|
| D11 | `seeds/003_ai_menus.ts` | 菜单种子 |
| D11 | `apps/admin/api/src/database/migrations.ts` | 注册迁移 |
| D11 | `packages/platform/boot/src/create-platform.ts` | boot 集成 |
| D12 | `pages/ai/knowledge-bases/*.tsx` | 知识库页面 |
| D12 | `pages/ai/agents/*.tsx` | Agent 页面 |
| D13 | `pages/ai/chat/index.tsx` | 对话入口 |
| D13 | `components/ai/*.tsx` | 共享组件 |
| D14 | 集成测试 + 修复 | 端到端验证 |

---

## 十七、自审：编码规范合规性

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 无 class | ✅ | 全部 createXxx 工厂函数（Error 除外） |
| 显式依赖注入 | ✅ | deps 参数传入，KnowledgeBaseServiceDeps 已定义 |
| 无 `any` | ✅ | 泛型 + Record<string, unknown>，Service 层返回具体类型 |
| 公共 API 显式返回类型 | ✅ | 所有 export 函数 |
| 文件名 kebab-case | ✅ | |
| 单文件 ≤ 300 行 | ✅ | 迁移文件已拆分为 003 + 004 |
| 测试 bun:test | ✅ | |
| SQL 参数化 | ✅ | tenant-query 工厂，无 raw() |
| 错误含 code + status + cause | ✅ | VentoStackError 子类，统一 cause 链 |
| 租户隔离 | ✅ | createTenantQuery 泛型接口 |
| 审批路由 | ✅ | routes/approval.ts |
| 健康检查 | ✅ | routes/health.ts |
| 分布式锁 | ✅ | agent-engine/distributed-lock.ts |
| Token 限流 | ✅ | agent-engine/token-budget.ts |
| SSE 连接限制 | ✅ | stream-engine/connection-limiter.ts |
| 缓存策略 | ✅ | cache/ai-cache.ts |
| 文件安全 | ✅ | knowledge-base/file-security.ts |

---

## 十八、总行数预估

| 层 | 文件数 | 预估总行数 |
|----|--------|-----------|
| errors | 1 | ~80 |
| models | 9 | ~250 |
| migrations | 2 | ~200 |
| llm-gateway | 6 | ~600 |
| knowledge-base | 8 | ~750 |
| agent-engine | 7 | ~600 |
| memory | 2 | ~150 |
| code-sandbox | 3 | ~150 |
| stream-engine | 3 | ~120 |
| cache | 1 | ~80 |
| tools | 3 | ~150 |
| services | 4 | ~400 |
| routes | 7 | ~450 |
| middlewares | 1 | ~10 |
| module + index | 2 | ~100 |
| tests | 21 | ~1800 |
| 前端 | 15 | ~2000 |
| **合计** | **95** | **~7890** |

---

> 本文档为技术实现方案 v1.0，待评审后迭代。

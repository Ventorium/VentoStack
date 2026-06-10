# VentoStack AI Agent 平台 — 整体设计文档

> 版本：v4.0 | 日期：2026-06-10 | 阶段：LLM Wiki 模式重构
>
> 变更历史：
> - v1.0 初版
> - v2.0 基于安全/架构/可行性/集成四维度评审修正
> - v3.0 基于深度安全/架构完整性/产品UX/实施细节二轮评审修正
> - v4.0 知识库从 RAG/Embedding 模式改为 LLM Wiki 模式（去掉 pgvector、Embedding、分块）
>
> 评审状态：安全 ✅ | 架构 ✅ | LLM Wiki 重构 ✅

---

## 一、目标与范围

### 1.1 业务目标

| 应用 | 场景 | 核心能力 | 优先级 |
|------|------|----------|--------|
| **知识库问答助手** | 基于企业文档的精准问答 | Markdown 文件管理、LLM 自主浏览、引用溯源 | MVP |
| **智能客服** | 自动回复用户咨询、FAQ 对接 | 对话管理、工具调用、人工升级 | v1.0 |
| **智能问数** | 自然语言查询业务数据 | Text-to-SQL、数据可视化、权限隔离 | v1.1 |

### 1.2 技术目标

- **增量演进**：基于现有 `@ventostack/ai` 增强，不破坏现有测试
- **Bun-first**：零 class、工厂函数、函数式优先
- **多供应商 LLM**：OpenAI / Anthropic 统一接入，流式输出 + 故障降级
- **安全默认**：纵深防御、Prompt 注入防护、SQL 静态分析、沙盒隔离

### 1.3 非目标

- 不做模型训练 / 微调平台
- 不做通用 Agent 市场 / 插件商店
- 不做多模态（语音/视频）
- **不做 GraphRAG / MCP / 多 Agent 编排**（推至 v2）

### 1.4 版本规划

| 版本 | 范围 | 预计工期 | 核心验证假设 |
|------|------|----------|-------------|
| **MVP-A** | LLM Gateway + 流式对话 + 硬编码知识库 | 2 周 | LLM + 流式 + 基础 RAG 链路跑通 |
| **MVP-B** | 知识库 CRUD + 文档导入 + Agent 配置 + 权限 | 2 周 | 管理员能自助完成配置 |
| **v1.0** | Agent 引擎 + 工具调用 + Docker 沙盒 + 记忆增强 | 4 周 | 工具调用 + 沙盒隔离在生产环境可用 |
| **v1.1** | Text-to-SQL + 混合检索 + MCP + 更多文档格式 | 4 周 | 智能问数场景落地 |
| **v2.0** | GraphRAG + PageIndex + 多 Agent 编排 | 待规划 | 高级检索和编排能力 |

> 总计 12-16 周（1 人全栈）或 8-10 周（2-3 人团队）。

---

## 二、整体架构

### 2.1 与现有模块的关系

**核心原则：增量增强，不破坏现有 API。**

| 现有模块 | 处理方式 | 说明 |
|---------|---------|------|
| `llm.ts` | 保留 + @deprecated | 新增 `llm-gateway/`，通过适配层桥接 |
| `tool-registry.ts` | 扩展 | `execute()` 新增可选 `ctx?: ToolContext` |
| `sandbox.ts` | **重命名为 `tool-policy.ts`** | index.ts 保留旧导出名作 re-export 别名 |
| `rag.ts` | 保留 + @deprecated | 新增 `knowledge-base/` |
| `context.ts` | 保留 + @deprecated | 新增 `memory/` |
| `rag-agent.ts` | 保留 + @deprecated | 新增 `agent-engine/` |
| `approval.ts` | 直接复用 | 审批请求需持久化到数据库 |
| `document-loader.ts` | 增强 | 扩展格式支持 |

**向后兼容保障**：

```typescript
// index.ts 中保留旧导出名
export { createToolPolicy as createSandbox, type ToolPolicy as Sandbox } from "./tool-policy";
// 旧测试文件的 import 路径无需修改
```

### 2.2 分层架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    apps/admin                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                       │
│  │ 知识库QA │  │ 智能客服  │  │ 智能问数  │  (v1.1)              │
│  └──────────┘  └──────────┘  └──────────┘                       │
├─────────────────────────────────────────────────────────────────┤
│                    packages/platform/ai                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ 知识库    │  │ Agent    │  │ 记忆系统  │  │ 工具中心  │        │
│  │ (RAG)    │  │ (Engine) │  │ (Memory) │  │ (Tools)  │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                      │
│  │ LLM 网关  │  │ 流式引擎  │  │ 代码沙盒  │                      │
│  └──────────┘  └──────────┘  └──────────┘                      │
│  接口定义层：LLMGateway / ToolRegistry                           │
└─────────────────────────────────────────────────────────────────┘
```

> 不创建独立 `packages/framework/ai/`。接口定义在 platform/ai 的 types 中导出。

### 2.3 模块依赖（完整）

| 模块 | 必须依赖 | 可选依赖 |
|------|---------|---------|
| **llm-gateway/** | 无 | 无 |
| **knowledge-base/** | database | cache |
| **agent-engine/** | llm-gateway | knowledge-base, memory, tool-registry, tool-policy, code-sandbox, eventBus, notification |
| **memory/** | database | cache, llm-gateway (摘要模式) |
| **code-sandbox/** | 无 | 无 |
| **tool-registry/** | 无 | tool-policy |
| **tool-policy/** | 无 | 无（现有模块重命名） |
| **tools/** | tool-registry | code-sandbox (terminal/file-write), knowledge-base (knowledge-search) |
| **stream-engine/** | core | llm-gateway (StreamChunk 类型) |

---

## 三、LLM Gateway

### 3.1 类型定义

```typescript
// packages/platform/ai/src/llm-gateway/types.ts

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

// LLM 层面的工具描述（不含 handler）
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

// ChatMessage 兼容 tool 角色
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface StreamChunk {
  type: "content" | "tool_call_start" | "tool_call_delta" | "usage" | "error" | "done";
  delta?: string;
  toolCall?: ToolCall;
  toolCallDelta?: { id?: string; name?: string; arguments?: string };
  usage?: TokenUsage;
  error?: { code: string; message: string; recoverable: boolean };
}
```

### 3.2 并发队列

```typescript
// packages/platform/ai/src/llm-gateway/queue.ts

export interface QueueConfig {
  maxConcurrent: number;    // 每 provider 最大并发，默认 10
  maxQueued: number;        // 最大排队数，默认 100
  queueTimeoutMs: number;   // 排队超时，默认 30000
}

export function createRequestQueue(config: QueueConfig): RequestQueue;
```

### 3.3 重试策略

```typescript
// packages/platform/ai/src/llm-gateway/retry.ts

export interface RetryConfig {
  maxRetries: number;           // 默认 3
  baseDelayMs: number;          // 默认 1000
  maxDelayMs: number;           // 默认 30000
  jitterFactor: number;         // 默认 0.1 (±10%)
  retryableStatusCodes: number[]; // 默认 [429, 500, 502, 503, 504]
}

// 指数退避 + jitter + 429 Retry-After 支持
export async function withRetry<T>(fn: () => Promise<T>, config?: Partial<RetryConfig>): Promise<T>;
```

### 3.4 工厂函数

```typescript
export function createLLMGateway(config: LLMGatewayConfig): LLMGateway;
export function createOpenAIProvider(config: OpenAIProviderConfig): LLMProvider;
export function createAnthropicProvider(config: AnthropicProviderConfig): LLMProvider;
// 旧接口适配
export function createLLMClientAdapter(gateway: LLMGateway): LLMClient;
```

> Anthropic Provider 需要独立的 SSE 解析器和消息格式转换（system 是顶层参数、tool_use 是 content_block、流式事件格式不同）。

---

## 四、知识库系统（LLM Wiki 模式）

> **核心思路**：知识以 Markdown 文件直接存储，LLM 通过工具调用自主浏览目录和读取文件。
> 不做分块、不做 Embedding、不做向量检索。利用 LLM 大上下文窗口 + 工具调用能力。

### 4.1 架构概览

```
管理员上传 Markdown 文件 → 存储到知识库目录
用户提问 → Agent 循环 → LLM 使用工具：
  - list_files: 浏览目录结构
  - read_file: 读取指定文件内容
  - search_files: 按关键词搜索文件
  - read_wiki_link: 追踪 [[wiki link]] 引用
→ LLM 基于读取的内容生成回答
```

**与 RAG 的本质区别**：
- RAG：预处理（分块+Embedding）→ 向量检索 → 注入 context → LLM 生成
- LLM Wiki：无预处理 → LLM 自主决定读哪些文件 → 工具调用获取内容 → LLM 生成

### 4.2 知识库数据模型

```typescript
// packages/platform/ai/src/knowledge-base/types.ts

export interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  basePath: string;           // 文件存储的基础路径
  tenantId: string;
  createdBy: string;
  status: "active" | "archived";
  documentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface KDocument {
  id: string;
  knowledgeBaseId: string;
  title: string;              // 文件标题（不含 .md 后缀）
  path: string;               // 相对于 basePath 的路径（如 "guides/setup.md"）
  content: string;            // Markdown 原始内容
  frontmatter?: Record<string, string>;  // YAML frontmatter
  links?: string[];           // 提取的 [[wiki link]] 目标
  tenantId: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// 文件系统条目（用于目录浏览）
export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileEntry[];     // 递归子项（限制深度）
}
```

### 4.3 知识库 SQL 模型

```sql
-- 知识库（无需 pgvector 扩展）
CREATE TABLE ai_knowledge_base (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  base_path VARCHAR(512) NOT NULL,  -- 文件存储路径
  tenant_id VARCHAR(36) NOT NULL,
  created_by VARCHAR(36) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  document_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ai_document (
  id VARCHAR(36) PRIMARY KEY,
  knowledge_base_id VARCHAR(36) NOT NULL REFERENCES ai_knowledge_base(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  path VARCHAR(512) NOT NULL,        -- 相对路径
  content TEXT NOT NULL,              -- Markdown 原始内容
  frontmatter JSON,                   -- YAML frontmatter
  links JSON,                         -- [[wiki link]] 目标列表
  tenant_id VARCHAR(36) NOT NULL,
  created_by VARCHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_ai_doc_kb ON ai_document(knowledge_base_id, tenant_id);
CREATE UNIQUE INDEX idx_ai_doc_path ON ai_document(knowledge_base_id, path);
-- 全文搜索索引（PostgreSQL 内置，无需 pgvector）
CREATE INDEX idx_ai_doc_content_fts ON ai_document
  USING gin(to_tsvector('simple', title || ' ' || content));
```

### 4.4 知识库工具（LLM 通过 Agent 循环调用）

```typescript
// packages/platform/ai/src/tools/kb-browse.ts
export function createKBBrowseTool(kbService: KnowledgeBaseService): Tool;
// 功能：列出知识库的目录结构
// 入参：{ kbId, path?: string, depth?: number }
// 返回：FileEntry[] 目录树

// packages/platform/ai/src/tools/kb-read.ts
export function createKBReadTool(kbService: KnowledgeBaseService): Tool;
// 功能：读取指定文件的完整内容
// 入参：{ kbId, path: string }
// 返回：{ title, content, frontmatter, links }

// packages/platform/ai/src/tools/kb-search.ts
export function createKBSearchTool(kbService: KnowledgeBaseService): Tool;
// 功能：按关键词搜索文件（全文搜索 + 文件名匹配）
// 入参：{ kbId, query: string, limit?: number }
// 返回：{ path, title, excerpt, score }[]

// packages/platform/ai/src/tools/kb-follow-link.ts
export function createKBFollowLinkTool(kbService: KnowledgeBaseService): Tool;
// 功能：追踪 [[wiki link]] 引用，读取目标文件
// 入参：{ kbId, link: string }
// 返回：{ title, content, path }
```

### 4.5 知识库服务

```typescript
// packages/platform/ai/src/knowledge-base/service.ts

export interface KnowledgeBaseService {
  // 知识库 CRUD
  create(params: { name: string; description?: string; tenantId: string; userId: string }): Promise<{ id: string }>;
  getById(id: string, tenantId: string): Promise<KnowledgeBase | null>;
  list(params: { tenantId: string; page?: number; pageSize?: number }): Promise<{ list: KnowledgeBase[]; total: number }>;
  delete(id: string, tenantId: string): Promise<void>;

  // 文档 CRUD
  createDocument(params: { kbId: string; title: string; path: string; content: string; tenantId: string; userId: string }): Promise<{ id: string }>;
  getDocument(docId: string, tenantId: string): Promise<KDocument | null>;
  updateDocument(docId: string, params: { content?: string; title?: string }, tenantId: string): Promise<void>;
  deleteDocument(docId: string, tenantId: string): Promise<void>;
  listDocuments(kbId: string, params?: { tenantId: string; page?: number; pageSize?: number }): Promise<{ list: KDocument[]; total: number }>;

  // 文件系统操作（供工具调用）
  browseDirectory(kbId: string, path: string, depth: number, tenantId: string): Promise<FileEntry[]>;
  readFile(kbId: string, path: string, tenantId: string): Promise<KDocument | null>;
  searchFiles(kbId: string, query: string, tenantId: string, limit?: number): Promise<Array<{ path: string; title: string; excerpt: string; score: number }>>;
  followLink(kbId: string, link: string, tenantId: string): Promise<KDocument | null>;
}

export function createKnowledgeBaseService(deps: { db: Database; eventBus?: EventBus }): KnowledgeBaseService;
```

### 4.6 文件安全

- 单文件 max 10MB，单知识库 max 1000 个文件
- 仅支持 `.md` 和 `.txt` 格式
- 文件名 sanitize：只保留 `[a-zA-Z0-9._/-]`，防止路径穿越
- 路径校验：解析后的路径必须在 basePath 内
- 内容校验：去除 null 字节，限制行数（max 10000 行）

---

## 五、Agent 引擎

### 5.1 Agent 循环（含并发控制）

```typescript
export interface AgentLoopDeps {
  llmGateway: LLMGateway;
  toolRegistry?: ToolRegistry;         // 包含知识库工具（kb-browse, kb-read, kb-search, kb-follow-link）
  memory?: MemoryService;
  codeSandbox?: CodeSandbox;
  eventBus?: EventBus;
  notificationService?: NotificationService;
  promptGuard?: PromptGuard;
  cache?: Cache;
}
```

> **注意**：`knowledgeBase` 不再作为 AgentLoopDeps 的直接依赖。
> 知识库访问通过 `toolRegistry` 中注册的知识库工具实现，LLM 自主决定何时读取哪个文件。

**并发控制**：同一 `conversation_id` 使用 Redis 分布式锁，消息串行处理。前端等待响应时禁用发送按钮。

**SSE 连接生命周期**：
- 监听 `AbortSignal`，客户端断开时自动取消 Agent 循环
- SSE 最大连接时长 5 分钟
- 心跳 15 秒间隔，3 次未响应断开
- per-user 最大 5 个并发 SSE 连接，超出返回 429

### 5.2 Agent 循环逻辑（含错误路径）

```
1. 获取 conversation_id 的 Redis 锁
2. 快照 Agent 配置（整个循环使用同一份配置）
3. 加载对话历史 → 失败则以空历史继续
4. 组装 messages: [system, ...history, user_message]
5. fitMessagesToBudget() 裁剪到 token 预算内
6. 调用 LLM（通过并发队列）
   → 429/5xx: 重试（指数退避 + jitter）
   → 所有 provider 失败: 返回友好错误
7. 如果 tool_calls:
   a. 解析工具调用（含 JSON 修复）
   b. Tool Policy 权限校验
   c. 高风险工具 → 发送 approval_required chunk + 等待审批（异步，不阻塞 SSE）
   d. 执行工具（超时 30s，结果截断 max 2000 tokens）
      - 知识库工具（kb-browse/kb-read/kb-search/kb-follow-link）的结果
        经过 PromptGuard 间接注入检测后再返回给 LLM
   e. 工具错误 → 返回结构化错误给 LLM 继续循环
   f. 检查 maxIterations → 超限强制终止
   g. 回到步骤 6
8. 如果 stop:
   a. 保存对话到 Memory
   b. 记录审计日志
   c. 释放 Redis 锁
   d. 返回结果
```

> **LLM Wiki 模式的关键区别**：没有预检索步骤。LLM 在工具调用循环中自主决定：
> - 先用 `kb-browse` 浏览目录结构
> - 再用 `kb-read` 读取感兴趣的文件
> - 用 `kb-search` 搜索关键词
> - 用 `kb-follow-link` 追踪 wiki 引用
> 这些工具调用自然地发生在 Agent 循环的步骤 7 中，与其他工具（终端、文件操作等）统一处理。

### 5.3 Prompt 注入防护（多层）

```typescript
export interface PromptGuard {
  checkInput(message: string): { safe: boolean; level: "safe" | "warning" | "blocked"; reason?: string };
  checkOutput(output: string, systemPrompt: string): { safe: boolean; level: "safe" | "warning" | "blocked"; reason?: string };
}
```

**防护层次**：
1. **输入预处理**：Unicode 规范化、零宽字符移除、特殊字符密度限制
2. **关键词检测**：中英文 + 多语言变体（法语、日语等）
3. **输出检测**：system prompt 原文 + 语义摘要泄露检测
4. **间接注入防护**：知识库检索结果在注入 context 前经过同样的检测
5. **上下文隔离**：知识库检索结果用 XML 标签包裹，明确区分系统指令和不可信内容
   ```
   <retrieved_context source="doc_id" confidence="0.85">
   ...检索内容...
   </retrieved_context>
   ```
6. **工具权限**：不依赖 prompt guard 作为唯一防线，工具权限和沙盒隔离才是真正的安全边界
7. **分级响应**：`warning` 触发审计但不阻断，`blocked` 阻断并返回友好提示

---

## 六、记忆系统

```typescript
export interface MemoryConfig {
  type: "window" | "summary";
  windowSize?: number;         // 默认 10
  summaryThreshold?: number;   // 默认 20
}

export interface MemoryService {
  getHistory(sessionId: string, limit?: number): Promise<ChatMessage[]>;
  appendMessage(sessionId: string, message: ChatMessage): Promise<void>;
  createSession(userId: string, agentId: string): Promise<string>;
  listSessions(userId: string, agentId: string): Promise<SessionInfo[]>;
  deleteSession(sessionId: string): Promise<void>;
  // 长期记忆（v1.0）
  getLongTermMemory(userId: string, key: string): Promise<string | null>;
  setLongTermMemory(userId: string, key: string, value: string): Promise<void>;
}
```

**Agent 配置快照**：`ai_conversation` 表增加 `agent_config_snapshot JSON` 字段，对话开始时快照配置，配置变更不影响进行中的对话。

---

## 七、沙盒环境

### 7.1 现有 sandbox.ts 重命名

重命名为 `tool-policy.ts`，index.ts 保留旧导出名作 re-export 别名。

### 7.2 代码执行沙盒

**统一使用 Bun 执行，不依赖 Python 环境。**

```typescript
export interface CodeSandboxConfig {
  type: "process" | "docker";
  timeout: number;           // 默认 30000ms
  memoryLimit?: string;      // Docker 模式，默认 "256m"
  networkAccess: boolean;    // 默认 false
  maxOutputSize: number;     // 默认 1MB
}
```

**process 模式（开发/测试）**：

```typescript
export function createProcessSandbox(config: CodeSandboxConfig): CodeSandbox {
  // 安全措施：
  // 1. bun run --no-permission 禁用所有 Bun 权限
  // 2. uid/gid 设置为非特权用户（如 65534/nobody）
  // 3. 环境变量严格白名单：只传 PATH 和 HOME
  // 4. stdout/stderr 输出限制 maxOutputSize（默认 1MB）
  // 5. 临时目录使用 Bun.tmpdir() + UUID，执行后 rm -rf
  // 6. process.on("exit") 清理子进程
  // 7. 仅支持 JavaScript/TypeScript（bun run）
}
```

**Docker 模式（生产环境）**：

```typescript
// 安全措施：
// bun run --no-permission（容器内执行）
// --network none
// --read-only
// --cap-drop ALL
// --security-opt no-new-privileges
// --user 65534
// --memory 256m --cpus 1.0
// seccomp profile
// stdout/stderr 输出限制 maxOutputSize
```

> MVP 阶段不实现代码执行沙盒。v1.0 引入。仅支持 JS/TS，不支持 Python。

---

## 八、流式引擎

```typescript
export function createSSEResponse(
  stream: AsyncIterable<StreamChunk>,
  options?: StreamOptions,
): Response;

// SSE 心跳：每 15 秒发送 ": heartbeat\n\n"
// SSE 错误格式（面向用户，不暴露内部码）：
// event: error
// data: {"code":"REQUEST_TIMEOUT","message":"服务暂时不可用","recoverable":true}
```

**SSE 认证**：前端用 `fetch()` + `ReadableStream`，通过 `Authorization` Header 传递 JWT。

**Token 刷新**：前端 single-flight 刷新器，所有并发调用共享同一个刷新请求。

```typescript
let refreshPromise: Promise<string> | null = null;
async function getValidToken(): Promise<string> {
  if (isTokenExpired()) {
    if (!refreshPromise) {
      refreshPromise = refreshToken().finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
  }
  return getToken();
}
```

---

## 九、Text-to-SQL 安全防护（v1.1）

```typescript
function analyzeSQL(sql: string): string[] {
  const violations: string[] = [];

  // 1. 去除注释（-- 和 /* */）
  const stripped = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const normalized = stripped.toUpperCase().trim();

  // 2. 只允许 SELECT（正则匹配开头，非 includes）
  if (!/^\s*SELECT\s/.test(normalized)) violations.push("只允许 SELECT 查询");

  // 3. 检测 CTE 中的写操作
  if (/WITH\s+.*\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\b/.test(normalized)) {
    violations.push("CTE 中禁止写操作");
  }

  // 4. 禁止多语句
  if (stripped.includes(";")) violations.push("禁止多语句查询");

  // 5. 禁止危险关键字（基于 stripped 而非原始 sql）
  const blocked = ["UNION", "INFORMATION_SCHEMA", "PG_CATALOG", "PG_SLEEP", "LO_IMPORT", "COPY"];
  for (const kw of blocked) {
    if (normalized.includes(kw)) violations.push(`禁止使用 ${kw}`);
  }

  // 6. LIMIT 数值上限
  const limitMatch = normalized.match(/LIMIT\s+(\d+)/);
  if (!limitMatch) violations.push("必须添加 LIMIT 限制");
  else if (parseInt(limitMatch[1], 10) > 1000) violations.push("LIMIT 不能超过 1000");

  return violations;
}
```

**只读连接**：连接字符串必须包含 `default_transaction_read_only=on`。

---

## 十、缓存策略

| 场景 | 存储 | TTL | 失效触发 |
|------|------|-----|---------|
| 知识库文件列表 | Redis `ai:kb:{kbId}:files` | 5min | 文档增删时清除 |
| 知识库搜索结果 | Redis `ai:kb:{kbId}:search:{queryHash}` | 5min | 文档变更时清除 |
| Agent 配置 | 内存 Map `ai:agent:{id}` | 5min | 配置变更时主动清除 |
| 对话历史 | Redis `ai:conv:{convId}:last{N}` | 10min | 新消息写入时清除 |

---

## 十一、数据模型（完整）

```sql
-- 无需 pgvector 扩展

CREATE TABLE ai_knowledge_base (
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
);

CREATE TABLE ai_document (
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
);
CREATE INDEX idx_ai_doc_kb ON ai_document(knowledge_base_id, tenant_id);
CREATE UNIQUE INDEX idx_ai_doc_path ON ai_document(knowledge_base_id, path);
-- PostgreSQL 内置全文搜索，无需 pgvector
CREATE INDEX idx_ai_doc_fts ON ai_document
  USING gin(to_tsvector('simple', title || ' ' || content));

CREATE TABLE ai_agent (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  avatar VARCHAR(512),
  type VARCHAR(32) NOT NULL DEFAULT 'chatbot',
  system_prompt TEXT NOT NULL,
  model VARCHAR(64) NOT NULL,
  tools JSON,
  knowledge_base_ids JSON,
  memory_config JSON,
  config JSON,
  max_iterations INT DEFAULT 10,
  max_tokens_per_turn INT DEFAULT 4096,
  tenant_id VARCHAR(36) NOT NULL,
  created_by VARCHAR(36) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'draft',  -- draft / active / disabled
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ai_conversation (
  id VARCHAR(36) PRIMARY KEY,
  agent_id VARCHAR(36) NOT NULL REFERENCES ai_agent(id) ON DELETE CASCADE,
  user_id VARCHAR(36) NOT NULL,
  title VARCHAR(255),
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  agent_config_snapshot JSON,  -- Agent 配置快照
  metadata JSON,
  tenant_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_ai_conv_user ON ai_conversation(user_id, agent_id, tenant_id);

CREATE TABLE ai_message (
  id VARCHAR(36) PRIMARY KEY,
  conversation_id VARCHAR(36) NOT NULL REFERENCES ai_conversation(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL,
  content TEXT,
  tool_calls JSON,
  tool_call_id VARCHAR(128),
  metadata JSON,
  token_count INT DEFAULT 0,  -- 使用 LLM API 返回的 usage
  tenant_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_ai_msg_conv ON ai_message(conversation_id, created_at);

CREATE TABLE ai_tool_log (
  id VARCHAR(36) PRIMARY KEY,
  conversation_id VARCHAR(36),
  message_id VARCHAR(36),
  tool_name VARCHAR(128) NOT NULL,
  input JSON,        -- 脱敏后的输入摘要
  output JSON,       -- 脱敏后的输出摘要
  status VARCHAR(16) NOT NULL,
  duration INT,
  user_id VARCHAR(36),
  tenant_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_ai_tool_log_conv ON ai_tool_log(conversation_id);
CREATE INDEX idx_ai_tool_log_tool ON ai_tool_log(tool_name, tenant_id);

CREATE TABLE ai_long_term_memory (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  key VARCHAR(128) NOT NULL,
  value TEXT NOT NULL,
  tenant_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_ai_ltm_user_key ON ai_long_term_memory(user_id, key, tenant_id);

CREATE TABLE ai_approval_request (
  id VARCHAR(36) PRIMARY KEY,
  tool_name VARCHAR(128) NOT NULL,
  input JSON,
  requested_by VARCHAR(36) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',  -- pending / approved / rejected / expired
  approved_by VARCHAR(36),
  comment TEXT,
  expires_at TIMESTAMP NOT NULL,  -- 默认 5 分钟超时
  tenant_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

> `document_count` 不在应用层维护，通过 `SELECT COUNT(*)` 实时查询。
> JSON 字段（tools, knowledge_base_ids, memory_config）在写入前经过 Zod Schema 校验。

---

## 十二、admin 层 — API、权限、前端

### 12.1 API 设计

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/ai/knowledge-bases` | GET/POST/PUT/DELETE | 知识库 CRUD |
| `/api/ai/knowledge-bases/:id/documents` | GET/POST/DELETE | 文档管理 |
| `/api/ai/agents` | GET/POST/PUT/DELETE | Agent CRUD |
| `/api/ai/conversations` | GET/DELETE | 会话管理 |
| `/api/ai/chat` | POST | 非流式对话 |
| `/api/ai/chat/stream` | POST | SSE 流式（fetch + ReadableStream） |
| `/api/ai/audit` | GET | 审计日志 |

### 12.2 权限与数据隔离

```
ai:knowledge-base:list / create / update / delete
ai:document:import
ai:agent:list / create / update / delete / publish
ai:chat:use
ai:audit:view
```

**数据隔离（代码层面强制）**：

```typescript
// packages/platform/ai/src/services/tenant-query.ts
export function createTenantQuery(db: Database, tenantId: string) {
  // 自动在所有查询中追加 WHERE tenant_id = $N
  // 所有 AI service 必须通过此工厂创建查询器
}
```

- 管理员：租户内全部可见
- 普通用户：只能使用 `is_public = true` 的 Agent，不能创建
- 所有查询强制 `tenant_id` 过滤，从 `ctx.user.tenantId` 获取

### 12.3 前端页面

```
pages/ai/
├── knowledge-bases/
│   ├── index.tsx           # 知识库列表
│   ├── [id]/
│   │   ├── index.tsx       # 知识库详情（含文档状态面板）
│   │   └── documents.tsx   # 文档管理（拖拽上传 + 进度）
│   └── create.tsx
├── agents/
│   ├── index.tsx           # Agent 列表
│   ├── [id]/
│   │   └── index.tsx       # Agent 编辑（右侧嵌入测试面板）
│   └── create.tsx
├── chat/
│   ├── index.tsx           # Agent 卡片选择
│   └── [sessionId].tsx     # 对话页面
└── audit/
    └── index.tsx
```

**对话页面 UX**：
- 左侧会话列表，右侧对话区域（参考 ChatGPT/Dify 三栏布局）
- 流式 Markdown 渲染（react-markdown + 代码高亮 + 未闭合代码块处理）
- "停止生成"按钮、错误重试按钮、复制/重新生成操作
- 引用溯源：编号内联 [1][2]，点击在侧边栏展示原文片段
- 移动端适配：`100dvh`、`env(safe-area-inset-bottom)`

**菜单结构**：

```
AI 智能
├── 知识库管理
├── Agent 管理
├── AI 对话        ← 普通用户可见
├── 对话管理       ← 管理员可见
└── 审计日志
```

**共享组件**：`ChatBubble`、`MarkdownRenderer`、`SourceCard`、`AgentCard`

---

## 十三、通知集成

```typescript
// module.ts 中注册事件监听
eventBus.on("ai.tool.approval_required", async (data) => {
  await notificationService.send({ receiverId: data.approverId, channel: "in_app", title: "AI 工具审批请求", content: `...` });
});
eventBus.on("ai.kb.indexed", async (data) => {
  await notificationService.send({ receiverId: data.userId, channel: "in_app", title: "知识库索引完成", content: `...` });
});
```

---

## 十四、错误类型定义

```typescript
// packages/platform/ai/src/errors.ts
import { VentoStackError } from "@ventostack/core";

export class AIGatewayError extends VentoStackError { /* provider, model */ }
export class KnowledgeBaseError extends VentoStackError {}
export class SandboxError extends VentoStackError {}
export class ToolExecutionError extends VentoStackError { /* toolName */ }

export const aiErrors = {
  llmTimeout: (provider) => new AIGatewayError("服务暂时不可用", 504, "AI_LLM_TIMEOUT", { provider }),
  llmRateLimited: (provider) => new AIGatewayError("请求过于频繁", 429, "AI_LLM_RATE_LIMITED", { provider }),
  llmAllFailed: () => new AIGatewayError("服务暂时不可用", 502, "AI_LLM_ALL_FAILED"),
  kbNotFound: () => new KnowledgeBaseError("知识库不存在", 404, "AI_KB_NOT_FOUND"),
  sandboxTimeout: () => new SandboxError("代码执行超时", 408, "AI_SANDBOX_TIMEOUT"),
  toolNotFound: (name) => new ToolExecutionError(`工具不存在`, 404, "AI_TOOL_NOT_FOUND", name),
  toolTimeout: (name) => new ToolExecutionError(`工具执行超时`, 408, "AI_TOOL_TIMEOUT", name),
  promptInjection: () => new AIGatewayError("检测到不安全的输入", 400, "AI_PROMPT_INJECTION"),
  maxIterations: () => new AIGatewayError("超过最大迭代次数", 400, "AI_MAX_ITERATIONS"),
  tokenBudgetExceeded: () => new AIGatewayError("今日对话额度已用完", 429, "AI_TOKEN_BUDGET"),
};
```

---

## 十五、Token 限流

```typescript
// MVP 阶段基础限流
export interface TokenBudgetConfig {
  perUserDaily: number;       // 默认 100K tokens
  perConversationTurns: number; // 默认 50 轮
}

// 每次 LLM 调用后累加 token 消耗到 Redis 计数器
// key: ai:token:{userId}:{date}
// 超限时返回 aiErrors.tokenBudgetExceeded()
```

---

## 十六、与现有模块集成

### 16.1 boot/create-platform.ts

```typescript
export interface PlatformConfig {
  // ...
  ai?: {
    enabled: boolean;
    llm: { providers: LLMProviderConfig[]; defaultModel: string };
  };
}

// createPlatform() 中
const ai = enabled.ai && config.ai
  ? createAIModule({
      db, cache, jwt, jwtSecret, rbac, eventBus,
      auditStore, notification,
      llmProviders: config.ai.llm.providers,
      defaultModel: config.ai.llm.defaultModel,
    })
  : undefined;
```

### 16.2 需要修改的现有文件

| 文件 | 修改 |
|------|------|
| `packages/platform/ai/src/sandbox.ts` | 重命名为 tool-policy.ts，index.ts 保留旧导出别名 |
| `packages/platform/ai/src/index.ts` | 新增导出 |
| `packages/platform/boot/src/create-platform.ts` | 新增 AI 模块注册 |
| `apps/admin/api/src/database/migrations.ts` | 注册 AI 迁移 |
| `apps/admin/web/src/api/index.ts` | 新增 SSE 客户端 |

---

## 十七、测试策略

| 层 | mock 策略 |
|----|----------|
| llm-gateway | `createMockLLMProvider()` 返回预设响应 |
| knowledge-base | 内存 VectorStore |
| agent-engine | mock LLM + mock Tool Registry |
| memory | createMockDatabase |
| sandbox | mock Bun.spawn |
| routes | 完整 mock 链 |
| 前端 | mock SSE 流 |

**多租户测试**：每个 service 测试必须覆盖跨租户隔离场景。

---

## 十八、实施路线图（修订）

### MVP-A（2 周）— "能对话"

| 周 | 任务 |
|----|------|
| W1 | LLM Gateway（OpenAI）+ 流式 + 并发队列 + 重试 |
| W2 | 知识库文件管理 + KB 工具（browse/read/search）+ Agent 对话循环 + 前端对话页 |

### MVP-B（2 周）— "能管理"

| 周 | 任务 |
|----|------|
| W3 | 数据模型 + 迁移 + 知识库 CRUD + Markdown 文件导入 + 文件安全校验 |
| W4 | Agent CRUD + 权限 + 多租户隔离 + 知识库管理页 + Token 限流 |

### v1.0（4 周）— "有工具的智能客服"

| 周 | 任务 |
|----|------|
| W5-6 | Tool Registry 扩展 + Tool Policy + 审批流（持久化）+ 内置工具 |
| W7 | Docker 沙盒 + 终端/文件工具 + Anthropic Provider |
| W8 | 记忆增强（长期记忆）+ PDF/HTML 文档导入 |

### v1.1（4 周）— "智能问数"

| 周 | 任务 |
|----|------|
| W9-10 | Text-to-SQL + SQL 安全分析 + 只读连接 |
| W11 | MCP 客户端 + DOCX/CSV 文档导入 |
| W12 | 集成测试 + 性能优化 + 监控面板 |

---

## 十九、技术风险与应对

| 风险 | 应对 | 验证时机 |
|------|------|---------|
| LLM 上下文窗口不够 | 文件搜索工具缩小范围 + 摘要 | MVP-A |
| LLM API 不可用 | 多 provider 降级 + 缓存 | MVP-A |
| Token 成本失控 | 对话窗口 + Token 预算 + 限流 | MVP-B |
| Prompt 注入（间接） | 知识库工具结果经 PromptGuard 检测 | MVP-A |
| 文件路径穿越 | 路径 sanitize + basePath 约束 | MVP-B |
| 并发数据混乱 | Redis 锁 + 消息队列 | MVP-A |

---

## 二十、监控

**关键指标**：LLM 延迟（P50/P95/P99）、Token 消耗（按用户/日）、知识库检索延迟、工具调用成功率。

**健康检查**：`GET /api/ai/healthz` → `{"status": "ok"}`（公开）
详细信息需认证：`GET /api/ai/health`（admin 权限）

---

## 二十一、待确认事项

1. **Docker 环境**：生产是否有 Docker？（v1.0 沙盒依赖）
2. **LLM 预算**：是否有 Token 消耗预算？
3. **现有 AI 测试**：重命名 sandbox.ts 后需更新测试引用

---

## 附录 A：二轮评审意见汇总

### 安全深度审查（5 P0 + 5 P1 + 5 P2）

| # | 问题 | 严重度 | 处理 |
|---|------|--------|------|
| P0-1 | SSE token 刷新竞态 | P0 | ✅ single-flight 刷新器 + 自动重连 |
| P0-2 | Python 沙盒无隔离 | P0 | ✅ process 模式不支持 Python |
| P0-3 | Bun --no-permission 不足 | P0 | ✅ uid/gid + 环境变量白名单 + 输出限制 |
| P0-4 | analyzeSQL 可绕过 | P0 | ✅ 去注释 + CTE 检测 + LIMIT 上限 + 只读连接 |
| P0-5 | Prompt 注入过于简单 | P0 | ✅ 多层防护 + 间接注入 + 分级响应 |
| P1-1 | tenant_id 无代码保障 | P1 | ✅ createTenantQuery 工厂 |
| P1-2 | JSON 字段无校验 | P1 | ✅ Zod Schema 校验 |
| P1-3 | 错误信息泄露 | P1 | ✅ 面向用户的友好 code + 脱敏 |
| P1-4 | Token 限流缺失 | P1 | ✅ per-user 每日上限 |
| P1-5 | 文件上传无防护 | P1 | ✅ magic bytes + sanitize + 大小限制 |

### 架构完整性审查（3 P0 + 5 P1）

| # | 问题 | 处理 |
|---|------|------|
| P0-1 | Agent 循环并发控制 | ✅ Redis 分布式锁 |
| P0-2 | SSE 连接生命周期 | ✅ AbortSignal + 超时 + 心跳 + 连接数限制 |
| P0-3 | ChatMessage 类型不兼容 | ✅ 扩展 role 支持 "tool" |
| P1-1 | 缓存策略缺失 | ✅ 新增第十节缓存策略 |
| P1-2 | Agent 配置快照 | ✅ agent_config_snapshot 字段 |
| P1-3 | 审批等待超时 | ✅ 异步化 + 5 分钟超时 + 持久化 |
| P1-4 | 去掉向量存储 | ✅ LLM Wiki 模式，无需向量数据库 |
| P1-5 | 迁移 down 方法 | ✅ 迁移脚本实现回滚 |

### 产品 UX 审查

| # | 问题 | 处理 |
|---|------|------|
| 1 | MVP 过重 | ✅ 拆分为 MVP-A + MVP-B |
| 2 | 文档导入进度 | ✅ 文档状态面板 |
| 3 | Agent 测试面板 | ✅ 编辑页内嵌测试 |
| 4 | 引用溯源 UX | ✅ 编号内联 + 侧边栏 |
| 5 | 对话页面设计 | ✅ 三栏布局 + 流式渲染 + 操作按钮 |
| 6 | 竞品差异化 | ✅ 嵌入式 + 多租户原生 + 安全审计 |

### 实施细节审查

| # | 问题 | 处理 |
|---|------|------|
| 1 | 无需 pgvector | ✅ LLM Wiki 模式，无需向量数据库 |
| 2 | 无需 Embedding | ✅ LLM 直接读取文件内容 |
| 3 | 无需分块 | ✅ 文件作为整体存储和读取 |
| 4 | 迁移回滚 | ✅ 实现 down 方法 |
| 5 | Anthropic API 差异 | ✅ 独立 SSE 解析器 + 消息转换 |
| 6 | 并发队列 | ✅ 新增 queue.ts |
| 7 | 文件安全 | ✅ 路径 sanitize + 大小限制 |
| 8 | 全文搜索 | ✅ PostgreSQL gin 索引 |
| 9 | 知识库工具 | ✅ browse/read/search/follow-link |
| 10 | 流式 Markdown | ✅ 未闭合代码块处理 |

---

> 本文档为 v3.0 版本，基于二轮评审修正。下一步：用户确认后开始实施。

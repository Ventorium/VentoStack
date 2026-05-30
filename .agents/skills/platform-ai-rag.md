---
name: platform-ai-rag
description: |
  @ventostack/ai 模块定位与开发规范。明确 platform/ai 不是通用 AI 框架，
  而是面向 RAG/Agent/知识库的业务封装层。提供 Tool Registry、权限沙箱、审批流、
  LLM 客户端、上下文管理、文档加载、知识库检索、RAG Agent 编排等能力。
---

# Platform AI — RAG/Agent/知识库封装规范

## 模块定位

**platform/ai 不是通用 AI 框架，而是业务封装层**：

```
framework/core          ← 无 AI 抽象（当前）
framework/openapi       ← 可扩展为 AI 接口契约
platform/ai             ← RAG/Agent/知识库业务封装 ✅
apps/admin/api          ← 集成 platform/ai 提供 API
apps/admin/web          ← 调用 AI API
```

### 为什么 framework 层不需要 AI 抽象？

1. AI 领域变化快，framework 层应保持稳定
2. Tool Registry、Sandbox、Approval 等概念属于业务语义，不是基础设施
3. platform/ai 已足够独立（仅依赖 `@ventostack/core` 和 `ajv`）
4. 避免 framework 层过度膨胀

### platform/ai 与 auth 的关系

**当前状态**: `packages/platform/ai` **不依赖** `@ventostack/auth`

```bash
$ rg "@ventostack/auth" packages/platform/ai/src/
# 无结果
```

ai 模块的权限控制通过以下方式实现：
- **Tool Registry**: 显式注册，禁止任意执行
- **Sandbox**: 工具白名单、网络/文件访问控制
- **Approval**: 敏感操作人工审批
- **应用层**: 在 `apps/admin/api` 中通过 auth 中间件保护 AI 路由

**这是正确的设计**：ai 模块提供安全机制，但不耦合认证实现。

## 核心能力矩阵

| 能力 | 文件 | 说明 |
|------|------|------|
| Tool Registry | `tool-registry.ts` | 显式工具注册、参数校验（JSON Schema）、超时执行 |
| Sandbox | `sandbox.ts` | 工具白名单、网络/文件访问控制、内存/CPU/超时限制 |
| Approval | `approval.ts` | 敏感工具调用的人工审批流（提交/批准/拒绝/过期） |
| Context Manager | `context.ts` | 对话上下文管理（消息历史、元数据、截断） |
| LLM Client | `llm.ts` | OpenAI 兼容客户端（原生 fetch，零额外依赖） |
| Knowledge Base | `rag.ts` | 文档存储、TF-IDF 检索、文本分块 |
| Document Loader | `document-loader.ts` | Markdown 加载、frontmatter 解析、自动分块 |
| RAG Agent | `rag-agent.ts` | 检索 + LLM 生成 + 上下文编排 |

## 使用场景

### 场景 1: 文档问答助手

```typescript
import { createKnowledgeBase, createContextManager, createLLMClient, createRAGAgent } from "@ventostack/ai";

const kb = createKnowledgeBase();
const ctx = createContextManager();
const llm = createLLMClient({ apiKey: env.OPENAI_KEY, model: "gpt-4" });

const agent = createRAGAgent(
  { knowledgeBase: kb, contextManager: ctx, llmClient: llm },
  { name: "docs-helper", systemPrompt: "你是一个技术文档助手。", topK: 5 },
);

// 加载文档
const docs = await loadDocumentsFromDirectory("./docs", kb);

// 对话
const result = await agent.chat("如何配置数据库连接？");
console.log(result.answer);      // 生成的回答
console.log(result.sources);     // 检索来源
```

### 场景 2: 带工具调用的 Agent

```typescript
import { createToolRegistry, createSandbox, createApprovalManager } from "@ventostack/ai";

const registry = createToolRegistry();
const sandbox = createSandbox({
  allowedTools: ["queryDatabase", "sendEmail"],
  allowNetworkAccess: false,
  maxExecutionTime: 5000,
});
const approval = createApprovalManager({ defaultTTL: 3600_000 });

// 注册工具
registry.register({
  name: "queryDatabase",
  description: "查询数据库",
  parameters: [{ name: "sql", type: "string", required: true }],
  handler: async (params) => { /* ... */ },
  requiresApproval: true,
  riskLevel: "high",
});

// 执行（需审批）
const request = await approval.request("queryDatabase", { sql: "SELECT * FROM users" }, "user-1");
// 管理员审批后
await approval.approve(request.id, "admin-1");
const result = await registry.execute("queryDatabase", { sql: "SELECT * FROM users" });
```

## 开发约束

1. **不引入向量数据库依赖**: 当前使用内存 TF-IDF，生产环境由应用层替换为向量数据库
2. **LLM Client 零依赖**: 使用原生 fetch，不引入 openai 包
3. **工具参数用 JSON Schema**: 通过 `ajv` 校验，不引入 zod（减少依赖）
4. **上下文存储在内存**: 多实例场景需外接 Redis（应用层决定）
5. **审批状态在内存**: 生产环境需持久化（应用层决定）

## 扩展方向

| 方向 | 说明 | 优先级 |
|------|------|--------|
| 向量数据库适配器 | 接入 pgvector / milvus / pinecone | P2 |
| 多模态支持 | 图片/音频输入处理 | P3 |
| Agent 工作流 | 多 Agent 协作、任务分解 | P3 |
| 记忆持久化 | 长期记忆存储与检索 | P3 |

## 禁止事项

- ❌ 在 ai 模块中引入 `@ventostack/auth`（保持独立）
- ❌ 引入 `openai` npm 包（使用原生 fetch）
- ❌ 引入向量数据库包（由应用层注入）
- ❌ 在 framework 层创建 AI 抽象（保持 framework 稳定）

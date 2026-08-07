---
order: 3
title: 知识库与智能体管理
description: 使用 createKnowledgeBase 和 createAgentRegistry 构建 RAG 应用
---

`@ventostack/ai` 提供了基于内存的知识库和智能体注册表，支持文档存储、TF-IDF 相似度检索、文本分块和智能体配置管理。生产环境建议将知识库替换为向量数据库实现。

## 知识库

`createKnowledgeBase()` 创建基于内存的知识库实例：

```typescript
import { createKnowledgeBase } from "@ventostack/ai";

const kb = createKnowledgeBase();

// 添加文档
const docId = kb.add({
  content: "VentoStack 是一个专为 Bun 运行时构建的全栈后端框架...",
  metadata: { source: "readme", category: "intro" },
});

// 批量添加文档
const docIds = [
  kb.add({
    content: "createRouter 用于定义 HTTP 路由...",
    metadata: { source: "docs", category: "api" },
  }),
  kb.add({
    content: "createApp 用于创建应用实例...",
    metadata: { source: "docs", category: "api" },
  }),
];

// 搜索文档（基于 TF-IDF 余弦相似度）
const results = kb.search("如何创建路由？", 5);
for (const result of results) {
  console.log(result.score, result.document.content);
}

// 列出所有文档
const allDocs = kb.list();

// 获取文档数量
console.log(kb.size());

// 删除文档
kb.remove(docId);
```

## 文本分块

`kb.chunk()` 将长文本按段落分割为重叠的 chunks：

```typescript
const longText = `
VentoStack 是一个专为 Bun 运行时构建的全栈后端框架。

它采用函数式优先的设计理念...

核心特性包括：
- 基于 Bun.serve 的高性能 HTTP 服务器
- 类型安全的路由系统
- 丰富的中间件生态
`;

const chunks = kb.chunk(longText, {
  maxChunkSize: 500,   // 每个 chunk 最大 500 字符
  overlap: 100,        // chunk 之间重叠 100 字符
  separator: "\n\n",   // 按段落分割
});

console.log(chunks.length); // 分块数量
```

## 智能体注册表

`createAgentRegistry()` 创建智能体配置注册表：

```typescript
import { createAgentRegistry, createKnowledgeBase } from "@ventostack/ai";

const registry = createAgentRegistry();
const kb = createKnowledgeBase();

// 注册智能体配置
registry.register({
  name: "tech_support",
  systemPrompt: "你是 VentoStack 框架的技术支持助手，请基于提供的文档回答问题。",
  inputSchema: {
    question: { type: "string", description: "用户问题", required: true },
    language: { type: "string", description: "回答语言", required: false },
  },
  knowledgeBase: kb,
  memory: {
    shortTerm: true,
    longTerm: false,
    maxItems: 50,
  },
});

// 获取智能体配置
const agent = registry.get("tech_support");
if (agent) {
  console.log(agent.systemPrompt);
}

// 列出所有智能体
const agents = registry.list();

// 移除智能体
registry.remove("tech_support");
```

## 在路由中使用

结合知识库和智能体配置构建问答 API：

```typescript
import { createApp, createRouter } from "@ventostack/core";
import { createKnowledgeBase, createAgentRegistry } from "@ventostack/ai";

const router = createRouter();
const kb = createKnowledgeBase();
const agents = createAgentRegistry();

// 初始化知识库
kb.add({ content: "VentoStack 使用 createRouter() 创建路由...", metadata: { topic: "routing" } });
kb.add({ content: "VentoStack 使用 createApp() 创建应用...", metadata: { topic: "app" } });

// 问答端点
router.post("/chat", async (ctx) => {
  const { question } = await ctx.request.json() as { question: string };

  const results = kb.search(question, 3);
  const context = results.map((r) => r.document.content).join("\n\n");

  return ctx.json({
    question,
    context,
    sources: results.map((r) => ({
      id: r.document.id,
      score: r.score,
      excerpt: r.document.content.slice(0, 200),
    })),
  });
});
```

## 接口定义

```typescript
/** 文档 */
interface Document {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
  embedding?: number[];
}

/** 文本分块选项 */
interface ChunkOptions {
  maxChunkSize?: number;
  overlap?: number;
  separator?: string;
}

/** 搜索结果 */
interface SearchResult {
  document: Document;
  score: number;
}

/** 知识库 */
interface KnowledgeBase {
  add(doc: Omit<Document, "id">): string;
  remove(id: string): boolean;
  search(query: string, limit?: number): SearchResult[];
  list(): Document[];
  size(): number;
  chunk(text: string, options?: ChunkOptions): string[];
}

/** 智能体配置 */
interface AgentConfig {
  name: string;
  systemPrompt: string;
  inputSchema?: Record<string, { type: string; description: string; required?: boolean }>;
  knowledgeBase?: KnowledgeBase;
  memory?: {
    shortTerm?: boolean;
    longTerm?: boolean;
    maxItems?: number;
  };
}

/** 智能体注册表 */
interface AgentRegistry {
  register(config: AgentConfig): void;
  get(name: string): AgentConfig | undefined;
  list(): AgentConfig[];
  remove(name: string): boolean;
}
```

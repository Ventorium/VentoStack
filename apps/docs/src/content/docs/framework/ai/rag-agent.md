---
title: RAG Agent
description: 使用 createRAGAgent 构建检索增强生成智能体
---

# RAG Agent（createRAGAgent）

`createRAGAgent` 编排知识库检索与 LLM 生成，实现 RAG（Retrieval-Augmented Generation）模式——先从知识库中检索相关文档片段，再将检索结果作为上下文传入 LLM 生成回答。

## 基本用法

```typescript
import { createLLMClient, createKnowledgeBase, createRAGAgent } from "@ventostack/ai";

const llm = createLLMClient({ apiKey: process.env.OPENAI_API_KEY! });
const kb = createKnowledgeBase({ executor, embedding: llm });

// 加载文档到知识库
await kb.ingest({
  source: "docs/guides",
  chunkSize: 512,
  chunkOverlap: 64,
});

const agent = createRAGAgent({
  llm,
  knowledgeBase: kb,
  topK: 5,              // 检索 Top-K 片段
  systemPrompt: "你是 VentoStack 框架的技术支持助手。根据检索到的文档回答问题。",
});

// 提问
const answer = await agent.ask("如何配置 Redis 缓存？");
console.log(answer);
```

## 流式回答

```typescript
const stream = await agent.askStream("VentoStack 的认证架构是怎样的？");

for await (const chunk of stream) {
  process.stdout.write(chunk);
}
```

## 配置选项

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `llm` | `LLMClient` | 是 | LLM 客户端实例 |
| `knowledgeBase` | `KnowledgeBase` | 是 | 知识库实例 |
| `topK` | `number` | 否 | 检索片段数量，默认 `5` |
| `systemPrompt` | `string` | 否 | 系统提示词 |
| `temperature` | `number` | 否 | LLM 生成温度 |

## 与工具注册配合

RAG Agent 可以与 `createToolRegistry` 配合，让 LLM 在回答时调用注册的工具：

```typescript
import { createToolRegistry, createRAGAgent } from "@ventostack/ai";

const tools = createToolRegistry();
tools.register("search_docs", {
  description: "搜索文档",
  parameters: { query: { type: "string" } },
  handler: async ({ query }) => kb.search(query),
});

const agent = createRAGAgent({ llm, knowledgeBase: kb, tools });
```

---
title: RAG 流水线
description: 使用 createRAGPipeline 构建检索增强生成应用
---

`createRAGPipeline` 提供了完整的 RAG（Retrieval-Augmented Generation）流水线，将文档检索与 LLM 生成相结合。

## 基本概念

RAG 工作流程：
1. **文档摄入**：将文档切片并生成 Embedding 向量
2. **向量存储**：将 Embedding 存入向量数据库
3. **查询检索**：根据用户问题检索相关文档片段
4. **生成回答**：将检索结果作为上下文传给 LLM 生成答案

## 基本用法

```typescript
import { createRAGPipeline } from "@aeron/ai";
import { createLLMAdapter } from "@aeron/ai";
import { createEmbeddingAdapter } from "@aeron/ai";

const llm = createLLMAdapter({ provider: "openai", model: "gpt-4o" });
const embedder = createEmbeddingAdapter({ provider: "openai", model: "text-embedding-3-small" });

const rag = createRAGPipeline({
  llm,
  embedder,
  vectorStore: createMemoryVectorStore(), // 或 Pinecone、Weaviate 等
});
```

## 摄入文档

```typescript
// 摄入文本文档
await rag.ingest([
  {
    id: "doc-1",
    content: "Aeron 是一个 Bun 原生的后端框架...",
    metadata: { source: "readme", category: "intro" },
  },
  {
    id: "doc-2",
    content: "createRouter 用于定义 HTTP 路由...",
    metadata: { source: "docs", category: "api" },
  },
]);

// 从文件摄入
await rag.ingestFile("./docs/guide.md", {
  chunkSize: 500,   // 每个片段的最大字符数
  chunkOverlap: 50, // 片段之间的重叠字符数
});
```

## 查询

```typescript
// 简单问答
const answer = await rag.query("如何创建一个路由？");
console.log(answer.text);
console.log(answer.sources); // 参考文档来源

// 带自定义 Prompt
const answer = await rag.query("如何处理错误？", {
  systemPrompt: "你是 Aeron 框架的技术支持助手，请基于提供的文档回答问题。",
  topK: 5, // 检索最相关的 5 个片段
});
```

## 在路由中使用

```typescript
router.post("/chat", async (ctx) => {
  const { question } = await ctx.body<{ question: string }>();

  const answer = await rag.query(question);

  return ctx.json({
    answer: answer.text,
    sources: answer.sources.map(s => ({ id: s.id, excerpt: s.content.slice(0, 200) })),
  });
});
```

## RAGPipeline 接口

```typescript
interface RAGPipeline {
  ingest(documents: Document[]): Promise<void>;
  ingestFile(path: string, options?: ChunkOptions): Promise<void>;
  query(question: string, options?: QueryOptions): Promise<RAGResult>;
}

interface RAGResult {
  text: string;
  sources: Document[];
  usage: TokenUsage;
}
```

---
title: LLM 客户端
description: 使用 createLLMClient 调用 OpenAI 兼容的 LLM 服务
---

# LLM 客户端（createLLMClient）

`createLLMClient` 提供 OpenAI 兼容的 HTTP 客户端，支持 Chat Completions 接口，可用于对接 OpenAI、Azure OpenAI、DeepSeek 或自建服务。

## 基本用法

```typescript
import { createLLMClient } from "@ventostack/ai";

const llm = createLLMClient({
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: "https://api.openai.com/v1", // 可替换为其他兼容端点
});

// 非流式调用
const response = await llm.chat({
  model: "gpt-4o",
  messages: [
    { role: "system", content: "你是一个有帮助的助手。" },
    { role: "user", content: "你好！" },
  ],
});

console.log(response.content);
```

## 流式调用

```typescript
const stream = await llm.chatStream({
  model: "gpt-4o",
  messages: [{ role: "user", content: "写一首诗" }],
});

for await (const chunk of stream) {
  process.stdout.write(chunk);
}
```

## 配置选项

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `apiKey` | `string` | 是 | API 密钥 |
| `baseURL` | `string` | 否 | API 端点，默认 `https://api.openai.com/v1` |
| `timeout` | `number` | 否 | 请求超时（毫秒） |
| `maxRetries` | `number` | 否 | 最大重试次数 |

## 与 RAG Agent 配合

`createLLMClient` 通常与 `createRAGAgent` 配合使用，为 RAG 检索结果生成自然语言回答：

```typescript
import { createLLMClient, createRAGAgent, createKnowledgeBase } from "@ventostack/ai";

const llm = createLLMClient({ apiKey: process.env.OPENAI_API_KEY! });
const kb = createKnowledgeBase({ executor, embedding: llm });
const agent = createRAGAgent({ llm, knowledgeBase: kb });

const answer = await agent.ask("VentoStack 的缓存策略有哪些？");
```

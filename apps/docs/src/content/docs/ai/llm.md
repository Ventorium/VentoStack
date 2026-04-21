---
title: LLM 适配器
description: 使用 createLLMAdapter 集成大语言模型
---

`@aeron/ai` 提供了统一的 LLM 适配器接口，支持 OpenAI、Anthropic 等主流 AI 服务，无需修改业务代码即可切换提供商。

## 支持的提供商

- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude)
- 本地模型（通过 Ollama）
- 自定义提供商

## 基本用法

```typescript
import { createLLMAdapter } from "@aeron/ai";

const llm = createLLMAdapter({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-4o",
});
```

## 文本生成

```typescript
// 简单文本生成
const response = await llm.complete("用一句话解释什么是量子计算");
console.log(response.text);
console.log(response.usage); // { inputTokens: 12, outputTokens: 50 }

// 对话模式
const messages = [
  { role: "system", content: "你是一个专业的代码审查助手" },
  { role: "user", content: "请审查以下代码：\n```ts\nconst x = 1\n```" },
];

const reply = await llm.chat(messages);
console.log(reply.content);
```

## 流式响应

```typescript
router.post("/ai/chat", async (ctx) => {
  const { message } = await ctx.body<{ message: string }>();

  const stream = await llm.stream([
    { role: "user", content: message }
  ]);

  // 返回 SSE 流
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        controller.enqueue(`data: ${JSON.stringify({ text: chunk.delta })}\n\n`);
      }
      controller.enqueue("data: [DONE]\n\n");
      controller.close();
    }
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    }
  });
});
```

## 函数调用

```typescript
const llm = createLLMAdapter({ provider: "openai", model: "gpt-4o" });

// 定义可调用的函数
const tools = [
  {
    name: "get_weather",
    description: "获取指定城市的当前天气",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string", description: "城市名称" },
      },
      required: ["city"],
    },
  },
];

const response = await llm.chat(
  [{ role: "user", content: "北京现在天气怎么样？" }],
  { tools }
);

if (response.toolCall) {
  const { name, arguments: args } = response.toolCall;
  if (name === "get_weather") {
    const weather = await getWeather(args.city);
    // 将工具结果返回给模型继续对话
    const finalResponse = await llm.chat([
      { role: "user", content: "北京现在天气怎么样？" },
      { role: "assistant", content: null, toolCall: response.toolCall },
      { role: "tool", toolCallId: response.toolCall.id, content: JSON.stringify(weather) },
    ]);
    return ctx.json({ reply: finalResponse.content });
  }
}
```

## LLMAdapter 接口

```typescript
interface LLMAdapter {
  complete(prompt: string, options?: CompletionOptions): Promise<CompletionResult>;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult>;
  stream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<StreamChunk>;
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  toolCall?: ToolCall;
  toolCallId?: string;
}
```

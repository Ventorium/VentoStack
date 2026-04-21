---
title: 流式响应
description: 使用 createStreamingHandler 处理 AI 流式输出
---

`createStreamingHandler` 简化了 AI 流式响应（Server-Sent Events）的处理，自动管理流的生命周期。

## 基本用法

```typescript
import { createStreamingHandler } from "@aeron/ai";
import { createLLMAdapter } from "@aeron/ai";

const llm = createLLMAdapter({ provider: "openai", model: "gpt-4o" });
const streaming = createStreamingHandler();

router.post("/ai/stream", async (ctx) => {
  const { message } = await ctx.body<{ message: string }>();

  return streaming.stream(async function* () {
    const stream = await llm.stream([{ role: "user", content: message }]);

    for await (const chunk of stream) {
      yield { type: "delta", text: chunk.delta };
    }

    yield { type: "done" };
  });
});
```

## 客户端消费

```javascript
const response = await fetch("/ai/stream", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: "解释量子纠缠" }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const lines = decoder.decode(value).split("\n");
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const data = JSON.parse(line.slice(6));
      if (data.type === "delta") {
        process.stdout.write(data.text); // 实时显示文本
      }
    }
  }
}
```

## 带进度的流式响应

```typescript
router.post("/ai/analyze", async (ctx) => {
  const { documents } = await ctx.body();

  return streaming.stream(async function* () {
    yield { type: "status", message: "正在分析文档..." };

    for (let i = 0; i < documents.length; i++) {
      const analysis = await llm.complete(`分析：${documents[i]}`);

      yield {
        type: "progress",
        current: i + 1,
        total: documents.length,
        result: analysis.text,
      };
    }

    yield { type: "done", message: "分析完成" };
  });
});
```

## StreamingHandler 接口

```typescript
interface StreamingHandler {
  stream(generator: () => AsyncGenerator<unknown>): Response;
}
```

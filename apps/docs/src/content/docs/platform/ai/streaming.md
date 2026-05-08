---
order: 2
title: 流式响应
description: 使用 Context.stream 或标准 Web API 实现 SSE 流式响应
---

VentoStack 的流式响应通过 `Context.stream()` 方法或标准 Web API 实现，不依赖 `@ventostack/ai` 包。

## 使用 ctx.stream

`ctx.stream(body, contentType)` 直接返回流式响应：

```typescript
import { createApp, createRouter } from "@ventostack/core";

const router = createRouter();

router.get("/events", async (ctx) => {
  const stream = new ReadableStream({
    start(controller) {
      let count = 0;
      const interval = setInterval(() => {
        count++;
        controller.enqueue(`data: ${JSON.stringify({ count, time: Date.now() })}
\n`);
        if (count >= 5) {
          clearInterval(interval);
          controller.close();
        }
      }, 1000);
    },
  });

  return ctx.stream(stream, "text/event-stream");
});
```

## 标准 SSE 响应

也可以直接使用标准 `Response` 构造 SSE 流：

```typescript
router.post("/ai/chat", async (ctx) => {
  const { message } = await ctx.request.json() as { message: string };

  const stream = new ReadableStream({
    async start(controller) {
      // 模拟 AI 流式输出
      const words = ["你好", "，", "这是", "一个", "流式", "响应", "。"];
      for (const word of words) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        controller.enqueue(`data: ${JSON.stringify({ text: word })}
\n`);
      }
      controller.enqueue("data: [DONE]\n\n");
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});
```

## 客户端消费

浏览器使用 `EventSource` 或 `fetch` + `ReadableStream` 消费 SSE：

```typescript
// 使用 EventSource（仅支持 GET）
const source = new EventSource("/events");
source.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data);
};

// 使用 fetch + ReadableStream（支持 POST 和自定义头）
const response = await fetch("/ai/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: "你好" }),
});

const reader = response.body!.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const lines = decoder.decode(value).split("\n");
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const data = line.slice(6);
      if (data === "[DONE]") {
        console.log("流结束");
      } else {
        console.log(JSON.parse(data));
      }
    }
  }
}
```

## 大文件流式下载

```typescript
router.get("/download", async (ctx) => {
  const file = Bun.file("/path/to/large-file.zip");

  return ctx.stream(file.stream(), "application/zip");
});
```

## Context.stream 接口

```typescript
interface Context {
  /**
   * 返回流式响应
   * @param body - 可读流
   * @param contentType - Content-Type，默认 application/octet-stream
   * @returns Response 对象
   */
  stream(body: ReadableStream, contentType?: string): Response;
}
```

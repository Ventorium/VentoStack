---
title: 分布式追踪
description: 使用 createTracer 实现 OpenTelemetry 兼容的分布式追踪
---

`createTracer` 提供了分布式追踪功能，兼容 OpenTelemetry 标准，可与 Jaeger、Zipkin、Tempo 等系统集成。

## 基本用法

```typescript
import { createTracer } from "@aeron/observability";

const tracer = createTracer({
  serviceName: "my-api",
  endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
});
```

## 创建 Span

```typescript
// 追踪一个操作
const span = tracer.start("get-user");
try {
  const user = await db.from("users").where("id", "=", userId).first();
  span.setAttribute("user.id", userId);
  span.setStatus("ok");
  return user;
} catch (err) {
  span.setStatus("error", (err as Error).message);
  throw err;
} finally {
  span.finish();
}
```

## 自动传播 Trace Context

```typescript
const tracingMiddleware: Middleware = async (ctx, next) => {
  const traceId = ctx.headers.get("x-trace-id") ?? crypto.randomUUID();
  const span = tracer.start("http-request", { traceId });

  span.setAttribute("http.method", ctx.method);
  span.setAttribute("http.path", ctx.path);

  ctx.state.span = span;
  ctx.state.traceId = traceId;

  try {
    await next();
    span.setAttribute("http.status", 200);
    span.setStatus("ok");
  } catch (err) {
    span.setStatus("error", (err as Error).message);
    throw err;
  } finally {
    span.finish();
  }
};
```

## 嵌套 Span

```typescript
async function getUserWithPosts(userId: string, parentSpan?: Span) {
  const span = tracer.start("get-user-with-posts", { parent: parentSpan });

  try {
    // 子操作的 span
    const userSpan = tracer.start("db-get-user", { parent: span });
    const user = await db.from("users").where("id", "=", userId).first();
    userSpan.finish();

    const postsSpan = tracer.start("db-get-posts", { parent: span });
    const posts = await db.from("posts").where("user_id", "=", userId).execute();
    postsSpan.finish();

    return { user, posts };
  } finally {
    span.finish();
  }
}
```

## Tracer 接口

```typescript
interface SpanOptions {
  traceId?: string;
  parent?: Span;
  attributes?: Record<string, string | number | boolean>;
}

interface Span {
  setAttribute(key: string, value: string | number | boolean): void;
  setStatus(status: "ok" | "error", message?: string): void;
  finish(): void;
}

interface Tracer {
  start(name: string, options?: SpanOptions): Span;
}
```

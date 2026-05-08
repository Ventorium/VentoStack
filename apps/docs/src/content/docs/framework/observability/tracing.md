---
order: 3
title: 分布式追踪
description: 使用 createTracer 实现内存分布式追踪
---

`createTracer` 提供了基于内存的分布式追踪功能，支持 Span 创建、属性设置、事件记录与父子关系。

## 基本用法

```typescript
import { createTracer } from "@ventostack/observability";

const tracer = createTracer();
```

## 创建 Span

```typescript
// 追踪一个操作
const span = tracer.startSpan("get-user");
try {
  const user = await db.query(UserModel).where("id", "=", userId).get();
  span.setAttribute("user.id", userId);
  span.setStatus("ok");
  return user;
} catch (err) {
  span.setStatus("error");
  throw err;
} finally {
  span.end();
}
```

## 嵌套 Span

```typescript
async function getUserWithPosts(userId: string, parentContext?: SpanContext) {
  const span = tracer.startSpan("get-user-with-posts", parentContext);

  try {
    // 子操作的 span
    const userSpan = tracer.startSpan("db-get-user", span.context());
    const user = await db.query(UserModel).where("id", "=", userId).get();
    userSpan.setStatus("ok");
    userSpan.end();

    const postsSpan = tracer.startSpan("db-get-posts", span.context());
    const posts = await db.query(PostModel).where("userId", "=", userId).list();
    postsSpan.setStatus("ok");
    postsSpan.end();

    return { user, posts };
  } catch (err) {
    span.setStatus("error");
    throw err;
  } finally {
    span.end();
  }
}
```

## 在中间件中使用

```typescript
const tracingMiddleware: Middleware = async (ctx, next) => {
  const span = tracer.startSpan("http-request");

  span.setAttribute("http.method", ctx.method);
  span.setAttribute("http.path", ctx.path);

  try {
    await next();
    span.setAttribute("http.status", ctx.response.status);
    span.setStatus("ok");
  } catch (err) {
    span.setStatus("error");
    throw err;
  } finally {
    span.end();
  }
};
```

## 获取活跃 Span

```typescript
const activeSpan = tracer.getActiveSpan();
if (activeSpan) {
  activeSpan.addEvent("checkpoint", { stage: "validation" });
}
```

## 导出已完成 Span

```typescript
// 获取并清空所有已完成的 span
const spans = tracer.flush();
// spans: Span[]
```

## Span 结构

```typescript
interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: "ok" | "error";
  attributes: Record<string, unknown>;
  events: Array<{ name: string; timestamp: number; attributes?: Record<string, unknown> }>;
}
```

## Tracer 接口

```typescript
interface SpanContext {
  traceId: string;
  spanId: string;
}

interface SpanHandle {
  context(): SpanContext;
  setAttribute(key: string, value: unknown): void;
  addEvent(name: string, attributes?: Record<string, unknown>): void;
  setStatus(status: "ok" | "error"): void;
  end(): void;
}

interface Tracer {
  startSpan(name: string, parentContext?: SpanContext): SpanHandle;
  getActiveSpan(): SpanHandle | null;
  flush(): Span[];
}
```

## 注意事项

- `createTracer` 是纯内存实现，Span 数据存储在内存数组中
- 当前不提供 OpenTelemetry 导出器或 Jaeger/Zipkin 集成；如需 OTLP 导出，可使用 `createOTelTracer`（从 `@ventostack/observability` 主入口导出，是 `createTracer` 的别名）
- `startSpan` 的第二个参数是父 `SpanContext`，不是 `SpanOptions` 对象
- Span 不会自动结束，必须显式调用 `end()`
- 已结束的 Span 可通过 `flush()` 获取并清空

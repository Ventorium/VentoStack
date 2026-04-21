---
title: 中间件
description: Aeron 中间件机制，使用 compose 组合中间件管道
---

Aeron 中间件遵循洋葱模型（Onion Model），与 Koa 类似。每个中间件可以在请求前后执行逻辑。

## 中间件签名

```typescript
type Middleware = (ctx: Context, next: NextFunction) => Response | Promise<Response | void> | void;
type NextFunction = () => Promise<void>;
```

## 基本用法

```typescript
import { createApp } from "@aeron/core";
import type { Middleware } from "@aeron/core";

const loggerMiddleware: Middleware = async (ctx, next) => {
  const start = Date.now();
  await next(); // 调用下一个中间件
  const ms = Date.now() - start;
  console.log(`${ctx.method} ${ctx.path} - ${ms}ms`);
};

const app = createApp({ port: 3000 });
app.use(loggerMiddleware);
app.start();
```

## 洋葱模型

中间件按注册顺序执行，但每个中间件可以在 `await next()` 前后分别执行逻辑：

```typescript
// 执行顺序: A前 -> B前 -> C处理 -> B后 -> A后
const middlewareA: Middleware = async (ctx, next) => {
  console.log("A: before");
  await next();
  console.log("A: after");
};

const middlewareB: Middleware = async (ctx, next) => {
  console.log("B: before");
  await next();
  console.log("B: after");
};

app.use(middlewareA);
app.use(middlewareB);
app.use(async (ctx) => {
  console.log("C: handle");
  return ctx.json({ ok: true });
});
```

## 提前返回

中间件可以提前返回响应，终止中间件链：

```typescript
const authMiddleware: Middleware = async (ctx, next) => {
  const token = ctx.headers.get("authorization");
  if (!token) {
    // 提前返回，后续中间件不会执行
    return ctx.json({ error: "Unauthorized" }, 401);
  }
  ctx.state.userId = parseToken(token);
  await next();
};
```

## compose 组合

使用 `compose` 将多个中间件组合成一个：

```typescript
import { compose } from "@aeron/core";

const securityMiddleware = compose(
  rateLimiterMiddleware,
  corsMiddleware,
  authMiddleware
);

app.use(securityMiddleware);
```

## 常见中间件示例

### CORS 中间件

```typescript
const cors: Middleware = async (ctx, next) => {
  ctx.responseHeaders.set("Access-Control-Allow-Origin", "*");
  ctx.responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  ctx.responseHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (ctx.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: ctx.responseHeaders });
  }

  await next();
};
```

### 请求 ID 中间件

```typescript
import { randomUUID } from "node:crypto";

const requestId: Middleware = async (ctx, next) => {
  const id = ctx.headers.get("x-request-id") ?? randomUUID();
  ctx.state.requestId = id;
  ctx.responseHeaders.set("x-request-id", id);
  await next();
};
```

### 错误处理中间件

```typescript
import { AeronError } from "@aeron/core";

const errorHandler: Middleware = async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    if (err instanceof AeronError) {
      return ctx.json({ error: err.message, code: err.code }, err.statusCode);
    }
    console.error(err);
    return ctx.json({ error: "Internal Server Error" }, 500);
  }
};

// 注册为第一个中间件，捕获所有后续错误
app.use(errorHandler);
```

### 请求体大小限制

```typescript
const bodyLimit = (maxBytes: number): Middleware => async (ctx, next) => {
  const contentLength = ctx.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    return ctx.json({ error: "Request body too large" }, 413);
  }
  await next();
};

app.use(bodyLimit(1024 * 1024)); // 1MB
```

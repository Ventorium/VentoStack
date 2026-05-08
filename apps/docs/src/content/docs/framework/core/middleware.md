---
order: 5
title: 中间件
description: VentoStack 中间件机制，使用洋葱模型组合请求处理管道
---

VentoStack 中间件遵循洋葱模型（Onion Model），与 Koa 类似。每个中间件可以在请求前后执行逻辑。

## 中间件签名

```typescript
type NextFunction = () => Promise<Response>;
type Middleware = (ctx: Context, next: NextFunction) => Promise<Response>;
```

每个中间件必须返回 `Promise<Response>`。调用 `await next()` 进入下一层，其返回值即为下游的 `Response`。

## 基本用法

```typescript
import { createApp, requestLogger, errorHandler } from "@ventostack/core";

const app = createApp({ port: 3000 });

// 内置错误处理中间件（建议最先注册）
app.use(errorHandler());

// 内置请求日志中间件
app.use(requestLogger());

// 自定义中间件示例
const timingMiddleware: Middleware = async (ctx, next) => {
  const start = performance.now();
  const response = await next();
  const duration = (performance.now() - start).toFixed(2);
  console.log(`${ctx.method} ${ctx.path} - ${duration}ms`);
  return response;
};

app.use(timingMiddleware);
await app.listen();
```

## 洋葱模型

中间件按注册顺序执行，但每个中间件可以在 `await next()` 前后分别执行逻辑：

```typescript
// 执行顺序: A前 -> B前 -> C处理 -> B后 -> A后
const middlewareA: Middleware = async (ctx, next) => {
  console.log("A: before");
  const response = await next();
  console.log("A: after");
  return response;
};

const middlewareB: Middleware = async (ctx, next) => {
  console.log("B: before");
  const response = await next();
  console.log("B: after");
  return response;
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
  return next();
};
```

## 内置中间件

### requestLogger — 请求日志

开箱即用的请求日志中间件，默认输出结构化 JSON：

```typescript
import { requestLogger } from "@ventostack/core";

// 默认使用 console 输出 JSON
app.use(requestLogger());

// 传入自定义 logger（兼容 @ventostack/observability 的 Logger）
app.use(requestLogger({ logger }));

// 静默模式（测试环境禁用日志）
app.use(requestLogger({ silent: true }));
```

### errorHandler — 全局错误处理

统一捕获未处理异常，`VentoStackError` 返回结构化响应，其他错误返回 500 且不暴露内部细节：

```typescript
import { errorHandler } from "@ventostack/core";

// 建议作为第一个中间件注册，捕获所有后续错误
app.use(errorHandler());

// 传入自定义 logger
app.use(errorHandler({ logger }));

// 自定义生产环境错误消息
app.use(errorHandler({ fallbackMessage: "服务暂时不可用" }));
```

### cors — 跨域处理

```typescript
import { cors } from "@ventostack/core";

app.use(cors({ origin: "https://example.com" }));

// 允许多个源
app.use(cors({ origin: ["https://a.com", "https://b.com"] }));

// 使用函数判断
app.use(cors({ origin: (origin) => origin.endsWith(".example.com") }));
```

### requestId — 请求 ID

从请求头读取或自动生成 UUID，并注入到 `ctx.state` 与响应头中：

```typescript
import { requestId } from "@ventostack/core";

app.use(requestId());           // 默认 X-Request-Id
app.use(requestId("X-Trace-Id")); // 自定义头名
```

## 常见中间件示例

### 请求体大小限制

```typescript
const bodyLimit = (maxBytes: number): Middleware => async (ctx, next) => {
  const contentLength = ctx.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    return ctx.json({ error: "Request body too large" }, 413);
  }
  return next();
};

app.use(bodyLimit(1024 * 1024)); // 1MB
```

### 静态文件服务 — createStaticMiddleware

提供安全的本地文件服务，内置路径遍历防护：

```typescript
import { createStaticMiddleware } from "@ventostack/core";

app.use(createStaticMiddleware({
  root: "/data/uploads",
  prefix: "/uploads",
}));
```

支持选项：`root`（文件根目录）、`prefix`（URL 前缀）、`allowedExtensions`（扩展名白名单）。


## 其他内置中间件

`@ventostack/core` 还提供了以下中间件，详见各自文档页面：

- **限流** — `rateLimit`（见 [限流](/framework/core/rate-limit)）
- **超时** — `timeout`（见 [超时](/framework/core/timeout)）
- **CSRF 防护** — `csrf`（见 [CSRF](/framework/core/csrf)）
- **SSRF 防护** — `createSSRFGuard`（见 [SSRF](/framework/core/ssrf)）
- **上传校验** — `createUploadValidator`（见 [上传](/framework/core/upload)）
- **HMAC 签名校验** — `createHMACSigner`（见 [HMAC](/framework/core/hmac)）
- **XSS 防护** — `xssProtection`（见 [XSS](/framework/core/xss)）
- **IP 过滤** — `ipFilter`（见 [IP 过滤](/framework/core/ip-filter)）
- **HTTPS 强制** — `httpsEnforce`（见 [HTTPS](/framework/core/https)）
- **多租户** — `createTenantMiddleware`（见 [多租户](/framework/core/tenant)）

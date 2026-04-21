---
title: 限流
description: 使用 createRateLimiter 保护应用免受暴力攻击和过载
---

`createRateLimiter` 提供了基于令牌桶算法的限流功能，支持按 IP、用户 ID 或自定义键进行限流。

## 基本用法

```typescript
import { createRateLimiter } from "@aeron/core";

const limiter = createRateLimiter({
  windowMs: 60_000,  // 时间窗口：1 分钟
  max: 100,          // 最大请求数
});

// 作为中间件使用
const rateLimitMiddleware: Middleware = async (ctx, next) => {
  const key = ctx.headers.get("x-forwarded-for") ?? ctx.request.headers.get("cf-connecting-ip") ?? "unknown";
  const result = limiter.check(key);

  ctx.responseHeaders.set("X-RateLimit-Limit", String(result.limit));
  ctx.responseHeaders.set("X-RateLimit-Remaining", String(result.remaining));
  ctx.responseHeaders.set("X-RateLimit-Reset", String(result.reset));

  if (!result.allowed) {
    ctx.responseHeaders.set("Retry-After", String(Math.ceil(result.retryAfter! / 1000)));
    return ctx.json({ error: "Too Many Requests" }, 429);
  }

  await next();
};

app.use(rateLimitMiddleware);
```

## 按路由配置

不同路由可以设置不同的限流规则：

```typescript
// API 全局限流
const apiLimiter = createRateLimiter({ windowMs: 60_000, max: 1000 });

// 登录接口严格限流
const loginLimiter = createRateLimiter({ windowMs: 900_000, max: 5 }); // 15分钟内5次

// 搜索接口限流
const searchLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });

router.post("/auth/login", applyRateLimit(loginLimiter), async (ctx) => {
  // 登录处理
});

router.get("/search", applyRateLimit(searchLimiter), async (ctx) => {
  // 搜索处理
});
```

## 按用户 ID 限流

```typescript
const userLimiter = createRateLimiter({ windowMs: 60_000, max: 200 });

const rateLimitByUser: Middleware = async (ctx, next) => {
  const user = ctx.state.user;
  const key = user ? `user:${user.id}` : `ip:${getClientIP(ctx)}`;
  const result = userLimiter.check(key);

  if (!result.allowed) {
    return ctx.json({ error: "请求过于频繁" }, 429);
  }

  await next();
};
```

## RateLimiter 接口

```typescript
interface RateLimiterOptions {
  windowMs: number;  // 时间窗口（毫秒）
  max: number;       // 窗口内最大请求数
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number;       // 重置时间戳（Unix 秒）
  retryAfter?: number; // 重试前需等待的毫秒数
}

interface RateLimiter {
  check(key: string): RateLimitResult;
  reset(key: string): void;
}
```

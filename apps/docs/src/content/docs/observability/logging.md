---
title: 结构化日志
description: 使用 createLogger 实现结构化日志记录
---

`createLogger` 提供了结构化的 JSON 日志，支持日志级别控制、上下文传递和多目标输出。

## 基本用法

```typescript
import { createLogger } from "@aeron/observability";

const logger = createLogger({
  level: "info",        // 最低日志级别
  service: "my-app",   // 服务名称（出现在每条日志中）
});

logger.debug("调试信息", { userId: "123" });
logger.info("用户登录", { userId: "123", ip: "1.2.3.4" });
logger.warn("请求缓慢", { path: "/api/users", latency: 2500 });
logger.error("数据库查询失败", { error: err.message, query: "SELECT..." });
```

## 日志级别

从低到高：`debug` < `info` < `warn` < `error`

设置 `level: "warn"` 时，只有 `warn` 和 `error` 级别的日志会输出。

## 结构化日志格式

每条日志输出为 JSON（生产环境）或格式化文本（开发环境）：

```json
{
  "level": "info",
  "timestamp": "2024-01-01T10:00:00.000Z",
  "service": "my-app",
  "message": "用户登录",
  "userId": "123",
  "ip": "1.2.3.4",
  "requestId": "abc-123"
}
```

## 请求日志中间件

```typescript
import { createLogger } from "@aeron/observability";
import type { Middleware } from "@aeron/core";

export function createRequestLogger(logger: ReturnType<typeof createLogger>): Middleware {
  return async (ctx, next) => {
    const start = Date.now();
    const requestId = crypto.randomUUID();
    ctx.state.requestId = requestId;

    try {
      await next();
      logger.info("HTTP 请求", {
        method: ctx.method,
        path: ctx.path,
        status: 200,
        latency: Date.now() - start,
        requestId,
      });
    } catch (err) {
      logger.error("HTTP 请求失败", {
        method: ctx.method,
        path: ctx.path,
        error: (err as Error).message,
        latency: Date.now() - start,
        requestId,
      });
      throw err;
    }
  };
}
```

## 子 Logger（携带固定上下文）

```typescript
const logger = createLogger({ level: "info", service: "api" });

// 创建携带请求上下文的子 logger
const requestLogger = logger.child({ requestId: "abc-123", userId: "user_1" });

// 子 logger 的每条日志都会包含 requestId 和 userId
requestLogger.info("处理订单");  
// { requestId: "abc-123", userId: "user_1", message: "处理订单", ... }
```

## 动态修改日志级别

```typescript
const logger = createLogger({ level: "info" });

// 临时开启 debug 模式（生产环境排查问题）
router.post("/admin/log-level", adminOnly, async (ctx) => {
  const { level } = await ctx.body<{ level: string }>();
  logger.setLevel(level);
  return ctx.json({ level });
});
```

## Logger 接口

```typescript
interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): Logger;
  setLevel(level: string): void;
}
```

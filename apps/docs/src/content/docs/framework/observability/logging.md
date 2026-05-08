---
order: 1
title: 结构化日志
description: 使用 createLogger 实现结构化日志记录
---

`createLogger` 提供了结构化的 JSON 日志，支持日志级别控制、上下文传递、自动脱敏与完全禁用（no-op）。

## 基本用法

```typescript
import { createLogger } from "@ventostack/observability";

const logger = createLogger({
  level: "info",        // 最低日志级别
});

logger.debug("调试信息", { userId: "123" });
logger.info("用户登录", { userId: "123", ip: "1.2.3.4" });
logger.warn("请求缓慢", { path: "/api/users", latency: 2500 });
logger.error("数据库查询失败", { error: err.message, query: "SELECT..." });
logger.fatal("系统崩溃", { reason: "out of memory" });
```

## 日志级别

从低到高：`debug` < `info` < `warn` < `error` < `fatal`

设置 `level: "warn"` 时，只有 `warn`、`error` 和 `fatal` 级别的日志会输出。

## 结构化日志格式

每条日志输出为 JSON（通过自定义 `output` 函数可改为其他格式）：

```json
{
  "level": "info",
  "timestamp": "2024-01-01T10:00:00.000Z",
  "message": "用户登录",
  "userId": "123",
  "ip": "1.2.3.4"
}
```

## 完全禁用日志

```typescript
const logger = createLogger({ enabled: false });
// 所有方法均为 no-op，不产生任何副作用
logger.info("这条日志不会输出");
```

## 子 Logger（携带固定上下文）

```typescript
const logger = createLogger({ level: "info" });

// 创建携带请求上下文的子 logger
const requestLogger = logger.child({ requestId: "abc-123", userId: "user_1" });

// 子 logger 的每条日志都会包含 requestId 和 userId
requestLogger.info("处理订单");
// { requestId: "abc-123", userId: "user_1", message: "处理订单", ... }
```

## 自动脱敏

默认对以下字段自动脱敏（替换为 `***`）：

`password`、`token`、`secret`、`key`、`cookie`、`authorization`

可自定义脱敏字段列表：

```typescript
const logger = createLogger({
  sensitiveFields: ["password", "ssn", "creditCard"],
});

logger.info("用户数据", { password: "123456", name: "Alice" });
// 输出中 password 字段会被替换为 "***"
```

## 自定义输出

```typescript
const logger = createLogger({
  output: (entry) => {
    // 自定义输出目标，如文件、远程日志服务等
    process.stderr.write(JSON.stringify(entry) + "\n");
  },
});
```

## Logger 接口

```typescript
interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  fatal(message: string, meta?: Record<string, unknown>): void;
  child(defaultMeta: Record<string, unknown>): Logger;
}

interface LoggerOptions {
  level?: LogLevel;              // "debug" | "info" | "warn" | "error" | "fatal"
  enabled?: boolean;             // false 时返回 no-op 记录器
  output?: (entry: LogEntry) => void;
  sensitiveFields?: string[];    // 自定义脱敏字段
}
```

## 注意事项

- 当前 `createLogger` 不支持动态修改日志级别（`setLevel` 不存在）
- 生产环境如需文件日志，可结合 `createFileLogger` 使用
- 如需接入远程日志系统，可使用 `createLogHook`

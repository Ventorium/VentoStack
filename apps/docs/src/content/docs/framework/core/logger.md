---
title: Logger Middleware
description: 请求日志中间件，记录方法、路径、状态码和耗时
---

`requestLogger` 中间件自动记录每个请求的方法、路径、状态码和处理耗时，默认输出结构化 JSON。

## 基本用法

```typescript
import { requestLogger } from "@ventostack/core";

app.use(requestLogger());
```

输出示例：

```json
{"level":"info","message":"request","method":"GET","path":"/users","status":200,"duration":"3.45ms"}
```

## 自定义 Logger

传入符合 `LoggerLike` 接口的日志实现（如 `@ventostack/observability` 的 Logger）：

```typescript
import { requestLogger } from "@ventostack/core";
import { createLogger } from "@ventostack/observability";

const logger = createLogger();
app.use(requestLogger({ logger }));
```

## 静默模式

测试环境可禁用日志输出：

```typescript
app.use(requestLogger({ silent: true }));
```

## 配置选项

### RequestLoggerOptions

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `logger` | `LoggerLike` | console JSON 输出 | 自定义日志实现 |
| `silent` | `boolean` | `false` | 是否静默 |

### LoggerLike 接口

| 方法 | 说明 |
|------|------|
| `info(message, meta?)` | 输出 info 级别日志 |
| `error(message, meta?)` | 输出 error 级别日志 |

### 记录字段

| 字段 | 说明 |
|------|------|
| `method` | 请求方法 |
| `path` | 请求路径 |
| `status` | 响应状态码 |
| `duration` | 处理耗时（毫秒） |

---
order: 12
title: 超时中间件
description: 使用 timeout 中间件为请求设置最大处理时间，超时返回 408 响应
---

## 概述

`timeout` 是一个中间件工厂函数，当请求处理超过指定时间未返回时，自动中止并返回 `408 Request Timeout` 响应，防止慢请求拖垮服务。

## 基本用法

```typescript
import { timeout } from "@ventostack/core";

app.use(timeout({ ms: 5000 }));
```

超时后返回的响应格式：

```json
{ "error": "请求超时" }
```

## 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `ms` | `number` | `30000` | 超时时间（毫秒） |
| `message` | `string` | `"请求超时"` | 超时响应消息 |

完整类型定义：

```typescript
interface TimeoutOptions {
  /** 超时时间（毫秒），默认 30000 */
  ms?: number;
  /** 超时响应消息，默认 "请求超时" */
  message?: string;
}

function timeout(options?: TimeoutOptions): Middleware;
```

## 注意事项

- 超时后返回状态码为 `408`，响应体为 JSON 格式
- 内部使用 `AbortController` 和 `Promise.race` 实现，不依赖平台特定 API
- 建议将超时中间件放在中间件链的靠前位置，确保所有后续处理都受超时保护

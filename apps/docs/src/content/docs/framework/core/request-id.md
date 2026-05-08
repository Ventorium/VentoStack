---
title: Request ID
description: 请求 ID 中间件，自动生成或从请求头读取唯一标识
---

`requestId` 中间件从请求头读取或自动生成 UUID，注入到 `ctx.state` 和响应头中，便于请求链路追踪。

## 基本用法

```typescript
import { requestId } from "@ventostack/core";

app.use(requestId());
```

客户端发送 `X-Request-Id` 头时复用，否则自动生成 UUID。

## 自定义头名

```typescript
app.use(requestId("X-Trace-Id"));
```

## 在下游使用

```typescript
app.use(requestId());

app.get("/api/data", (ctx) => {
  const id = ctx.state.requestId;
  console.log("处理请求:", id);
  return ctx.json({ requestId: id });
});
```

## 函数签名

```typescript
function requestId(headerName?: string): Middleware;
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `headerName` | `string` | `"X-Request-Id"` | 请求头名称 |

## 行为说明

- 请求头存在该字段时，直接使用其值
- 不存在时调用 `crypto.randomUUID()` 自动生成
- 生成的 ID 存入 `ctx.state.requestId`
- 响应头中自动附加相同的 ID

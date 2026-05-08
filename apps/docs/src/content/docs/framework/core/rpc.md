---
title: RPC
description: 内部服务间 RPC 通信，支持进程内路由和跨服务 HTTP 客户端
---

`createRPCRouter` 提供进程内 RPC 方法注册与调用，`createRPCClient` 提供基于 HTTP 的跨服务 RPC 客户端。

## 进程内 RPC

```typescript
import { createRPCRouter } from "@ventostack/core";

const rpc = createRPCRouter();

// 注册方法
rpc.register<{ id: string }, { name: string }>("getUser", async (req) => {
  return { name: `User ${req.id}` };
});

// 调用
const result = await rpc.call("getUser", { id: "1" });
// => { name: "User 1" }

// 列出已注册方法
rpc.methods(); // ["getUser"]
```

> 重复注册同名方法会抛出错误，调用未注册方法同样会抛错。

## 跨服务 HTTP 客户端

```typescript
import { createRPCClient } from "@ventostack/core";

const client = createRPCClient({
  baseUrl: "https://user-service.internal",
  timeout: 5000,
  headers: { Authorization: "Bearer internal-token" },
});

const user = await client.call<{ id: string }, { name: string }>("getUser", {
  id: "1",
});
```

客户端会向 `{baseUrl}/rpc/{method}` 发送 `POST` JSON 请求。

## 配置选项

### RPCClientOptions

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `baseUrl` | `string` | — | 服务基础 URL（必填） |
| `timeout` | `number` | `30000` | 请求超时（毫秒） |
| `headers` | `Record<string, string>` | `{}` | 附加请求头 |

## 错误处理

- 进程内：调用未注册方法抛出 `Error("RPC method not found: ...")`
- HTTP 客户端：响应非 2xx 时抛出包含状态码和响应体的错误
- 超时时自动中止请求（`AbortController`）

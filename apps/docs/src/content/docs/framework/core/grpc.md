---
title: gRPC
description: gRPC 服务抽象层，基于 JSON 序列化的类型安全内部 RPC
---

`createGRPCServer` 提供了轻量级 gRPC 风格的服务抽象。内部使用 JSON 序列化（非 protobuf），适合微服务间的类型安全通信。

## 基本用法

```typescript
import { createGRPCServer, GRPCStatusCode, GRPCError } from "@ventostack/core";

const server = createGRPCServer();

// 定义服务
const userService = {
  name: "UserService",
  methods: {
    GetUser: { requestType: "GetUserRequest", responseType: "User" },
  },
};

// 注册处理器
server.addService(userService, {
  async GetUser(request, ctx) {
    return { id: request.id, name: "Alice" };
  },
});

// 调用方法
const user = await server.call("UserService", "GetUser", { id: "1" });
```

## 元数据传递

处理器可通过 `ctx.metadata` 读取请求元数据：

```typescript
server.addService(userService, {
  async GetUser(request, ctx) {
    const auth = ctx.metadata.get("authorization");
    // ...
    return { id: request.id };
  },
});

await server.call("UserService", "GetUser", { id: "1" }, {
  authorization: "Bearer xxx",
});
```

## 错误处理

使用 `GRPCError` 抛出带有标准状态码的错误：

```typescript
import { GRPCError, GRPCStatusCode } from "@ventostack/core";

server.addService(userService, {
  async GetUser(request) {
    const user = await findUser(request.id);
    if (!user) {
      throw new GRPCError(GRPCStatusCode.NOT_FOUND, "User not found");
    }
    return user;
  },
});
```

## 配置选项

### ServiceDefinition

| 属性 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 服务名称 |
| `methods` | `Record<string, MethodDefinition>` | 方法定义映射 |

### MethodDefinition

| 属性 | 类型 | 说明 |
|------|------|------|
| `requestType` | `string` | 请求类型名称 |
| `responseType` | `string` | 响应类型名称 |
| `streaming` | `"client" \| "server" \| "bidi"` | 流式模式（可选） |

### GRPCContext

| 属性 | 类型 | 说明 |
|------|------|------|
| `metadata` | `Map<string, string>` | 请求元数据 |
| `deadline` | `number?` | 截止时间戳 |
| `cancelled` | `boolean` | 是否已取消 |

### GRPCStatusCode

常用状态码常量：`OK(0)`、`CANCELLED(1)`、`NOT_FOUND(5)`、`UNIMPLEMENTED(12)`、`INTERNAL(13)`、`UNAUTHENTICATED(16)` 等。

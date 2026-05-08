---
title: WebSocket
description: WebSocket 路由支持，基于 Bun.serve() 实现路径匹配与消息处理
---

`createWebSocketRouter` 提供了轻量级 WebSocket 路由器，支持路径匹配、通配符和升级校验。

## 基本用法

```typescript
import { createWebSocketRouter } from "@ventostack/core";

const wsRouter = createWebSocketRouter();

wsRouter.ws("/chat", {
  open(ws) {
    console.log("客户端已连接");
  },
  message(ws, msg) {
    ws.send(`收到: ${msg}`);
  },
  close(ws, code, reason) {
    console.log("连接关闭", code);
  },
});
```

## 通配符匹配

路径支持 `/*` 通配符：

```typescript
wsRouter.ws("/room/*", {
  message(ws, msg) {
    // 匹配 /room/123、/room/abc 等
    console.log("房间消息:", msg);
  },
});
```

## 升级校验

通过 `upgrade` 回调在握手阶段拒绝非法连接：

```typescript
wsRouter.ws("/private", {
  upgrade(req) {
    const token = new URL(req.url).searchParams.get("token");
    return token === "secret";
  },
  message(ws, msg) {
    ws.send("pong");
  },
});
```

## 附加自定义数据

通过 `data` 回调将自定义数据注入 `ws.data`：

```typescript
wsRouter.ws("/user", {
  data(req) {
    const url = new URL(req.url);
    return { userId: url.searchParams.get("uid") };
  },
  open(ws) {
    console.log("用户 ID:", ws.data.userId);
  },
  message(ws, msg) {
    ws.send(`Hello ${ws.data.userId}`);
  },
});
```

## 编译集成 Bun.serve()

调用 `compile()` 生成可直接传入 `Bun.serve()` 的配置：

```typescript
const compiled = wsRouter.compile();

Bun.serve({
  port: 3000,
  fetch(req, server) {
    if (compiled.upgrade(req, server)) return;
    return new Response("Not found", { status: 404 });
  },
  websocket: compiled.handlers,
});
```

## 配置选项

### WSRoute

| 属性 | 类型 | 说明 |
|------|------|------|
| `path` | `string` | 路由路径 |
| `open` | `(ws) => void` | 连接建立回调 |
| `message` | `(ws, msg) => void` | 消息接收回调（必填） |
| `close` | `(ws, code, reason) => void` | 连接关闭回调 |
| `drain` | `(ws) => void` | 缓冲区排空回调 |
| `upgrade` | `(req) => boolean \| Promise<boolean>` | 升级前校验，返回 `false` 拒绝连接 |
| `data` | `(req) => Record<string, unknown>` | 附加到 `ws.data` 的数据工厂 |

### WSConnection

| 方法/属性 | 说明 |
|-----------|------|
| `send(data)` | 发送字符串或 Buffer |
| `close(code?, reason?)` | 关闭连接 |
| `data` | 只读附加数据 |
| `readyState` | 连接状态 |

---
title: 应用创建
description: 使用 createApp 创建 Aeron HTTP 应用
---

`createApp` 是 Aeron 应用的入口点，基于 `Bun.serve()` 构建高性能 HTTP 服务器。

## 基本用法

```typescript
import { createApp } from "@aeron/core";

const app = createApp({ port: 3000 });
app.start();
```

## 配置选项

```typescript
interface AppConfig {
  port?: number;          // 监听端口，默认 3000
  host?: string;          // 监听地址，默认 "0.0.0.0"
  development?: boolean;  // 开发模式，启用详细错误信息
}
```

## 注册中间件

使用 `app.use()` 注册中间件，按注册顺序执行：

```typescript
import { createApp, createRouter } from "@aeron/core";

const app = createApp({ port: 3000 });

// 注册全局中间件
app.use(async (ctx, next) => {
  console.log(`${ctx.method} ${ctx.path}`);
  await next();
});

// 注册路由中间件
const router = createRouter();
router.get("/", async (ctx) => ctx.json({ ok: true }));
app.use(router.middleware());

app.start();
```

## 生命周期

```typescript
const app = createApp({ port: 3000 });

// 服务器启动后触发
app.onStart(() => {
  console.log("Server started on port 3000");
});

// 服务器关闭前触发
app.onStop(async () => {
  await db.close();
  console.log("Database connection closed");
});

app.start();
```

## 优雅停机

Aeron 会自动处理 `SIGINT` 和 `SIGTERM` 信号，在关闭前触发 `onStop` 回调：

```typescript
const app = createApp({ port: 3000 });

app.onStop(async () => {
  // 等待正在处理的请求完成
  await drainConnections();
  // 关闭数据库连接
  await db.close();
});

app.start();
```

## AeronApp 接口

```typescript
interface AeronApp {
  use(middleware: Middleware): void;
  onStart(handler: () => void | Promise<void>): void;
  onStop(handler: () => void | Promise<void>): void;
  start(): void;
  stop(): Promise<void>;
}
```

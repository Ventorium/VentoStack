---
order: 1
title: 应用创建
description: 使用 createApp 创建 VentoStack HTTP 应用
---

`createApp` 是 VentoStack 应用的入口点，基于 `Bun.serve()` 构建高性能 HTTP 服务器。

## 基本用法

```typescript
import { createApp } from "@ventostack/core";

const app = createApp({ port: 3000 });
await app.listen();
```

## 配置选项

```typescript
interface AppConfig {
  port?: number;      // 监听端口，默认 3000
  hostname?: string;  // 监听主机名，默认 "0.0.0.0"
}
```

## 注册中间件

使用 `app.use()` 注册中间件，按注册顺序执行：

```typescript
import { createApp, createRouter, requestLogger, errorHandler } from "@ventostack/core";

const app = createApp({ port: 3000 });

// 内置中间件（建议最先注册 errorHandler，再注册 requestLogger）
app.use(errorHandler());
app.use(requestLogger());

// 注册路由
const router = createRouter();
router.get("/", async (ctx) => ctx.json({ ok: true }));
app.use(router);

await app.listen();
```

## 生命周期

```typescript
const app = createApp({ port: 3000 });

// 服务器启动后触发
app.lifecycle.onAfterStart(() => {
  console.log("Server started on port 3000");
});

// 服务器关闭前触发
app.lifecycle.onBeforeStop(async () => {
  await db.close();
  console.log("Database connection closed");
});

await app.listen();
```

## 优雅停机

VentoStack 在关闭流程里会触发 `onBeforeStop` 回调：

```typescript
const app = createApp({ port: 3000 });

app.lifecycle.onBeforeStop(async () => {
  // 等待正在处理的请求完成
  await drainConnections();
  // 关闭数据库连接
  await db.close();
});

await app.listen();
```

## 注册可访问地址

应用启动后可以注册可访问地址，用于日志输出或健康检查：

```typescript
app.addUrl("API Docs", "/docs");
app.addUrl("Health", "/health");

// 读取已注册的地址
for (const url of app.urls) {
  console.log(`${url.label}: ${url.path}`);
}
```

## VentoStackApp 接口

```typescript
interface VentoStackApp {
  use(item: Middleware | Router | Plugin): VentoStackApp;
  listen(port?: number): Promise<void>;
  close(): Promise<void>;
  addUrl(label: string, path: string): void;
  readonly router: Router;
  readonly lifecycle: Lifecycle;
  readonly urls: ReadonlyArray<AppUrl>;
}
```

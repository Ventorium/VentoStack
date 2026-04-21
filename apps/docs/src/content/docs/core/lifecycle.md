---
title: 生命周期
description: 使用 createLifecycle 管理应用生命周期钩子
---

`createLifecycle` 提供了完整的应用生命周期管理，支持启动、停止和各种阶段的钩子。

## 基本用法

```typescript
import { createLifecycle } from "@aeron/core";

const lifecycle = createLifecycle();

lifecycle.onStart(async () => {
  console.log("应用正在启动...");
  await db.connect();
});

lifecycle.onStop(async () => {
  console.log("应用正在停止...");
  await db.close();
});

// 触发启动
await lifecycle.start();

// 触发停止
await lifecycle.stop();
```

## 与 createApp 集成

`createApp` 内部使用 lifecycle，但你也可以手动使用：

```typescript
import { createApp, createLifecycle } from "@aeron/core";

const lifecycle = createLifecycle();
const app = createApp({ port: 3000 });

// 数据库连接
lifecycle.onStart(async () => {
  await db.connect();
  console.log("数据库已连接");
});

// 缓存预热
lifecycle.onStart(async () => {
  await cache.warm();
  console.log("缓存已预热");
});

// 优雅停机
lifecycle.onStop(async () => {
  await db.close();
  await cache.close();
  console.log("所有连接已关闭");
});

await lifecycle.start();
app.start();

// 处理系统信号
process.on("SIGTERM", async () => {
  await lifecycle.stop();
  process.exit(0);
});
```

## 多个生命周期钩子

可以注册多个同类型的钩子，按注册顺序执行：

```typescript
const lifecycle = createLifecycle();

// 钩子 1
lifecycle.onStart(async () => {
  await connectDatabase();
});

// 钩子 2（在钩子 1 之后执行）
lifecycle.onStart(async () => {
  await runMigrations();
});

// 钩子 3（在钩子 2 之后执行）
lifecycle.onStart(async () => {
  await seedInitialData();
});
```

## 错误处理

如果启动钩子抛出错误，启动过程会终止：

```typescript
lifecycle.onStart(async () => {
  try {
    await db.connect();
  } catch (err) {
    console.error("数据库连接失败:", err);
    throw err; // 重新抛出，阻止启动
  }
});
```

## Lifecycle 接口

```typescript
interface Lifecycle {
  onStart(handler: () => void | Promise<void>): void;
  onStop(handler: () => void | Promise<void>): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

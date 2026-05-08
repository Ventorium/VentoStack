---
order: 2
title: 生命周期
description: 通过 app.lifecycle 管理应用启动、路由编译和关闭阶段的钩子
---

`app.lifecycle` 用来管理应用生命周期钩子。当前实现包含 4 个阶段：

- `onBeforeStart`：启动服务前执行
- `onBeforeRouteCompile`：路由编译前执行
- `onAfterStart`：服务启动后执行
- `onBeforeStop`：服务关闭前执行

## 基本用法

`createApp()` 内部已经集成了 lifecycle。调用 `app.listen()` 和 `app.close()` 时，会按下面的顺序自动触发：

1. `onBeforeStart`
2. `onBeforeRouteCompile`
3. 编译路由并启动服务
4. `onAfterStart`
5. `onBeforeStop`

直接在 `app.lifecycle` 上注册钩子即可：

```typescript
import { createApp } from "@ventostack/core";

const app = createApp({ port: 3000 });

app.lifecycle.onBeforeStart(async () => {
  await db.connect();
  console.log("数据库已连接");
});

app.lifecycle.onBeforeRouteCompile(() => {
  registerDynamicRoutes(app.router);
});

app.lifecycle.onAfterStart(() => {
  console.log("服务已启动");
});

app.lifecycle.onBeforeStop(async () => {
  await db.close();
  console.log("数据库连接已关闭");
});

await app.listen();

process.on("SIGTERM", async () => {
  await app.close();
  process.exit(0);
});
```

## 多个钩子与执行顺序

同一阶段可以注册多个钩子。

- `onBeforeStart`、`onAfterStart`、`onBeforeStop` 按注册顺序执行
- `onBeforeRouteCompile` 按 `priority` 从小到大执行；优先级相同时，按注册顺序执行

```typescript
const app = createApp();

app.lifecycle.onBeforeStart(async () => {
  await connectDatabase();
});

app.lifecycle.onBeforeStart(async () => {
  await warmCache();
});

app.lifecycle.onBeforeRouteCompile(() => {
  registerCoreRoutes();
}, 0);

app.lifecycle.onBeforeRouteCompile(() => {
  registerPluginRoutes();
}, 10);
```

## 错误处理

如果某个钩子抛出错误，对应阶段会立刻中断，错误会继续向外抛出：

```typescript
app.lifecycle.onBeforeStart(async () => {
  try {
    await db.connect();
  } catch (error) {
    console.error("数据库连接失败:", error);
    throw error;
  }
});
```

## Lifecycle 接口

```typescript
interface Lifecycle {
  onBeforeStart(handler: () => void | Promise<void>): void;
  onAfterStart(handler: () => void | Promise<void>): void;
  onBeforeRouteCompile(handler: () => void | Promise<void>, priority?: number): void;
  onBeforeStop(handler: () => void | Promise<void>): void;
}
```

`runBeforeStart()`、`runBeforeRouteCompile()`、`runAfterStart()` 和 `runBeforeStop()` 是框架内部在 `createApp()` 中调用的执行方法，业务代码通常只需要注册钩子，不需要自己触发它们。

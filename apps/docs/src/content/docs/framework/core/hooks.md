---
title: Hooks
description: 自定义生命周期 Hook 系统，支持同步/异步事件监听与一次性回调
---

`createHookRegistry` 提供了轻量级事件 Hook 注册表，支持 `on`、`once`、`emit`、`off` 操作。

## 基本用法

```typescript
import { createHookRegistry } from "@ventostack/core";

const hooks = createHookRegistry();

// 注册监听
const unsubscribe = hooks.on("user:created", (data) => {
  console.log("新用户:", data.name);
});

// 触发 hook
await hooks.emit("user:created", { name: "Alice", id: "1" });

// 取消监听
unsubscribe();
```

## 一次性监听

使用 `once` 注册只触发一次的回调：

```typescript
hooks.once("app:ready", (data) => {
  console.log("应用就绪，仅执行一次");
});

await hooks.emit("app:ready", {});
await hooks.emit("app:ready", {}); // 不会再触发
```

## 批量清理

```typescript
hooks.off("user:created"); // 移除该 hook 的所有监听
```

## 列出已注册 Hook

```typescript
hooks.hooks(); // ["user:created", "app:ready"]
```

## 与模块系统集成

在模块中使用 Hook 实现松耦合通信：

```typescript
const userModule = defineModule({
  name: "users",
  async onInit() {
    hooks.on("order:paid", async (order) => {
      await notifyUser(order.userId);
    });
  },
});
```

## HookRegistry 接口

| 方法 | 说明 |
|------|------|
| `on(hookName, callback)` | 注册监听，返回取消函数 |
| `once(hookName, callback)` | 注册一次性监听，返回取消函数 |
| `emit(hookName, data)` | 触发 hook，按注册顺序异步执行所有回调 |
| `off(hookName)` | 移除指定 hook 的所有监听 |
| `hooks()` | 列出所有已注册的 hook 名称 |

> 回调支持同步和异步（`void | Promise<void>`），`emit` 会按顺序 `await` 每个回调。

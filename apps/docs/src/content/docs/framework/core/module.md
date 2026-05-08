---
title: Module
description: 模块系统，通过 defineModule 和 createModuleRegistry 组织应用功能
---

模块系统将应用功能拆分为独立单元，每个模块可拥有自己的路由、服务和生命周期钩子。

## 定义模块

```typescript
import { defineModule } from "@ventostack/core";

const userModule = defineModule({
  name: "users",
  routes(router) {
    router.get("/users", (ctx) => ctx.json([{ id: 1 }]));
    router.post("/users", (ctx) => ctx.json({ created: true }));
  },
  services: {
    userService: { findAll: () => [], findById: (id) => ({}) },
  },
  async onInit() {
    console.log("用户模块已初始化");
  },
  async onDestroy() {
    console.log("用户模块已销毁");
  },
});
```

## 注册与使用

```typescript
import { createModuleRegistry } from "@ventostack/core";

const registry = createModuleRegistry();
const app = createApp();

registry.register(userModule);
registry.register(orderModule);

// 初始化所有模块
await registry.initAll();

// 将模块路由应用到路由器
registry.applyRoutes(app.router);

// 优雅关闭时销毁
await registry.destroyAll();
```

## 禁用模块

通过 `disabled` 标记跳过注册：

```typescript
const betaModule = defineModule({
  name: "beta-features",
  disabled: true, // 不会被注册
  routes(router) { /* ... */ },
});
```

## 管理模块

```typescript
registry.getModule("users");   // 获取指定模块
registry.listModules();         // 列出所有模块
```

## ModuleDefinition

| 属性 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 模块名称（必填） |
| `disabled` | `boolean` | 是否禁用 |
| `routes` | `(router) => void` | 路由注册函数 |
| `services` | `Record<string, unknown>` | 模块服务集合 |
| `onInit` | `() => void \| Promise<void>` | 初始化钩子 |
| `onDestroy` | `() => void \| Promise<void>` | 销毁钩子 |

## ModuleRegistry 接口

| 方法 | 说明 |
|------|------|
| `register(module)` | 注册模块（disabled 模块会被跳过） |
| `getModule(name)` | 获取指定模块 |
| `listModules()` | 列出所有已注册模块 |
| `initAll()` | 按注册顺序初始化所有模块 |
| `destroyAll()` | 按逆序销毁所有模块 |
| `applyRoutes(router)` | 将所有模块路由应用到路由器 |

---
title: 插件系统
description: 使用 createPluginRegistry 和 createPluginSandbox 构建可扩展的插件系统
---

Aeron 提供了完整的插件系统，支持插件注册、依赖管理和沙箱隔离执行。

## 插件注册

```typescript
import { createPluginRegistry } from "@aeron/core";

const registry = createPluginRegistry();

// 注册一个插件
registry.register({
  name: "my-plugin",
  version: "1.0.0",
  description: "示例插件",
  setup: async (ctx) => {
    // 插件初始化逻辑
    console.log("插件已加载");
  }
});
```

## 插件依赖

插件可以声明依赖其他插件：

```typescript
registry.register({
  name: "auth-plugin",
  version: "1.0.0",
  dependencies: ["database-plugin"], // 依赖 database-plugin
  setup: async (ctx) => {
    // 此时 database-plugin 已初始化
    const db = ctx.get("database");
    // 使用数据库...
  }
});

registry.register({
  name: "database-plugin",
  version: "1.0.0",
  setup: async (ctx) => {
    const db = createQueryBuilder({ url: process.env.DATABASE_URL! });
    ctx.set("database", db); // 向 context 注入
  }
});

// 按依赖顺序初始化所有插件
await registry.init();
```

## 插件沙箱

`createPluginSandbox` 提供隔离的执行环境，防止插件访问未授权资源：

```typescript
import { createPluginSandbox } from "@aeron/core";

const sandbox = createPluginSandbox({
  allowedModules: ["node:path", "node:os"],  // 允许访问的模块
  timeout: 5000,                              // 执行超时（ms）
});

// 在沙箱中执行代码
const result = await sandbox.execute(`
  const path = require("node:path");
  return path.join("a", "b", "c");
`);

console.log(result.output); // "a/b/c"
```

## PluginRegistry 接口

```typescript
interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  dependencies?: string[];
  setup: (ctx: PluginContext) => void | Promise<void>;
}

interface PluginRegistry {
  register(manifest: PluginManifest): void;
  init(): Promise<void>;
  get(name: string): PluginEntry | undefined;
  list(): PluginEntry[];
}
```

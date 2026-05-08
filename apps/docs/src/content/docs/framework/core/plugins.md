---
order: 9
title: 插件系统
description: 使用 Plugin 接口、createPluginRegistry 和 createPluginSandbox 构建可扩展的插件系统
---

VentoStack 提供了插件相关的接口和工具，但当前阶段插件系统主要提供基础注册和隔离能力，尚未提供完整的生命周期依赖注入框架。

## Plugin 接口

最简单的插件形式是实现 `Plugin` 接口，通过 `app.use()` 注册到应用：

```typescript
import type { Plugin, VentoStackApp } from "@ventostack/core";

const myPlugin: Plugin = {
  name: "my-plugin",
  async install(app: VentoStackApp) {
    // 插件初始化逻辑
    app.router.get("/health", async (ctx) => ctx.json({ status: "ok" }));
  }
};

const app = createApp();
app.use(myPlugin);
```

## 插件注册表

`createPluginRegistry` 提供插件清单的注册、查询和依赖检查能力：

```typescript
import { createPluginRegistry } from "@ventostack/core";

const registry = createPluginRegistry();

// 注册插件清单
registry.register({
  name: "my-plugin",
  version: "1.0.0",
  description: "示例插件",
  keywords: ["example"],
});

// 查询
console.log(registry.has("my-plugin")); // true
console.log(registry.get("my-plugin")); // { manifest, installedAt }
console.log(registry.list());           // 所有已注册条目
console.log(registry.search("example")); // 按关键词搜索

// 注销
registry.unregister("my-plugin");
```

### 依赖检查

```typescript
registry.register({
  name: "auth-plugin",
  version: "1.0.0",
  dependencies: ["database-plugin"],
});

registry.register({
  name: "database-plugin",
  version: "1.0.0",
});

const result = registry.checkDependencies("auth-plugin");
// { satisfied: true, missing: [] }
```

## 插件沙箱

`createPluginSandbox` 提供隔离的插件执行环境，单个插件失败不影响其他插件：

```typescript
import { createPluginSandbox } from "@ventostack/core";

const sandbox = createPluginSandbox();

// 注册隔离插件
sandbox.register({
  name: "safe-plugin",
  version: "1.0.0",
  async install(context) {
    console.log("safe-plugin initialized");
  },
  async destroy() {
    console.log("safe-plugin destroyed");
  },
});

// 初始化所有插件
const results = await sandbox.initAll(app);
// [{ name: "safe-plugin", success: true, duration: 1.23 }]

// 查看插件状态
console.log(sandbox.list());
// [{ name: "safe-plugin", version: "1.0.0", status: "initialized" }]

// 销毁所有插件
await sandbox.destroyAll();
```

## 接口定义

```typescript
interface Plugin {
  name: string;
  install(app: VentoStackApp): void | Promise<void>;
}

interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  keywords?: string[];
  dependencies?: string[];
}

interface PluginRegistry {
  register(manifest: PluginManifest): void;
  unregister(name: string): boolean;
  get(name: string): PluginRegistryEntry | undefined;
  list(): PluginRegistryEntry[];
  search(query: string): PluginRegistryEntry[];
  has(name: string): boolean;
  checkDependencies(name: string): { satisfied: boolean; missing: string[] };
}

interface PluginSandbox {
  register(plugin: IsolatedPlugin): void;
  list(): PluginInfo[];
  initAll(context: unknown): Promise<PluginInitResult[]>;
  destroyAll(): Promise<void>;
}

interface IsolatedPlugin {
  name: string;
  version?: string;
  install?(context: unknown): void | Promise<void>;
  destroy?(): void | Promise<void>;
}
```

## 与完整插件框架的区别

当前实现的插件系统侧重于：

1. **显式注册** — 通过 `app.use(plugin)` 或 `registry.register()` 手动注册
2. **清单管理** — 记录插件元数据、版本和依赖关系
3. **隔离执行** — 沙箱中单个插件失败不影响其他插件
4. **依赖检查** — 静态检查依赖是否满足，但不自动按拓扑顺序初始化

以下功能**尚未实现**：
- 自动按依赖拓扑排序初始化
- 插件间服务注入（`ctx.get("database")` 等）
- 动态模块加载（`require` 隔离）
- 插件配置系统

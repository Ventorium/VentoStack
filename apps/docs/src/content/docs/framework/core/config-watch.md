---
order: 22
title: 配置热更新
description: 使用 createConfigWatcher 实现配置变更时自动生效，无需重启服务
---

## 概述

`createConfigWatcher` 创建配置热更新监控器，支持 watch + callback 模式。当配置发生变更时，通过回调通知应用，实现配置动态生效。

## 基本用法

```typescript
import { createConfigWatcher } from "@ventostack/core";

const watcher = createConfigWatcher({
  interval: 5000,
  onChange: async (newConfig, oldConfig) => {
    console.log("配置已变更:", newConfig);
    // 重新初始化依赖配置的模块
  },
});

// 启动监控
watcher.start(initialConfig);

// 手动触发更新
await watcher.update(newConfig);

// 停止监控
watcher.stop();
```

## 接口定义

```typescript
interface ConfigWatcherOptions {
  /** 检查间隔（毫秒） */
  interval?: number;
  /** 变更回调 */
  onChange: (
    newConfig: Record<string, unknown>,
    oldConfig: Record<string, unknown>,
  ) => void | Promise<void>;
}

interface ConfigWatcher {
  start(initial: Record<string, unknown>): void;
  stop(): void;
  isWatching(): boolean;
  update(newConfig: Record<string, unknown>): Promise<void>;
  getConfig(): Record<string, unknown>;
}

function createConfigWatcher(options: ConfigWatcherOptions): ConfigWatcher;
```

## 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `interval` | `number` | `5000` | 检查间隔（毫秒） |
| `onChange` | `(new, old) => void \| Promise<void>` | **必填** | 变更时的回调函数 |

## 监控器方法

| 方法 | 说明 |
|------|------|
| `start(initial)` | 以初始配置启动监控 |
| `stop()` | 停止监控 |
| `isWatching()` | 返回当前是否在监控 |
| `update(newConfig)` | 手动更新配置，变更时触发回调 |
| `getConfig()` | 获取当前配置的副本 |

## 注意事项

- 变更检测使用 `JSON.stringify` 深度比较，适用于配置对象的简单比较场景
- `onChange` 回调支持异步函数，更新期间配置会锁定
- 手动调用 `update` 同样会触发变更检测和回调

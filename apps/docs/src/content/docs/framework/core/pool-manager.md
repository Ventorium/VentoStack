---
title: Pool Manager
description: 通用资源池管理器，用于优雅关闭时统一释放所有连接池和资源
---

`createPoolManager` 提供了统一的资源注册与释放机制，确保应用退出时所有连接池（数据库、Redis 等）被正确关闭。

## 基本用法

```typescript
import { createPoolManager } from "@ventostack/core";

const poolManager = createPoolManager();

// 注册资源（需实现 Disposable 接口）
poolManager.register({
  name: "postgres",
  async close() {
    await pgPool.end();
  },
});

poolManager.register({
  name: "redis",
  async close() {
    await redisClient.quit();
  },
});

// 应用退出时统一释放
const results = await poolManager.releaseAll();
console.log(results);
// [{ name: "redis" }, { name: "postgres" }]
```

## 释放顺序

资源按**后进先出**（LIFO）顺序释放，后注册的资源先关闭。即使某个资源释放失败，其余资源仍会继续释放。

## 查看已注册资源

```typescript
poolManager.list(); // ["postgres", "redis"]
```

## 与生命周期集成

```typescript
const app = createApp({
  async onShutdown() {
    const results = await poolManager.releaseAll();
    const errors = results.filter(r => r.error);
    if (errors.length) {
      console.error("部分资源释放失败:", errors);
    }
  },
});
```

## Disposable 接口

| 属性/方法 | 类型 | 说明 |
|-----------|------|------|
| `name` | `string` | 资源名称 |
| `close()` | `() => Promise<void>` | 关闭/释放资源 |

## PoolManager 接口

| 方法 | 说明 |
|------|------|
| `register(resource)` | 注册可释放资源 |
| `releaseAll()` | 逆序释放所有资源，返回结果列表 |
| `list()` | 获取已注册资源名称列表 |

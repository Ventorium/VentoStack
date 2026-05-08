---
title: Instance Coordinator
description: 多实例协调器，管理实例生命周期状态，适配 K8s 探针
---

`createInstanceCoordinator` 管理当前实例的生命周期状态（starting → ready → draining → stopped），配合 Kubernetes readiness/liveness probe 使用。

## 基本用法

```typescript
import { createInstanceCoordinator } from "@ventostack/core";

const coordinator = createInstanceCoordinator();

// 应用启动完成后标记为就绪
coordinator.markReady();

// 检查状态
coordinator.isReady(); // true
coordinator.isLive();  // true
```

## 配合 K8s 探针

```typescript
// liveness 探针端点
app.get("/healthz", (ctx) => {
  return coordinator.isLive()
    ? ctx.json({ status: "ok" })
    : ctx.json({ status: "stopped" }, 503);
});

// readiness 探针端点
app.get("/readyz", (ctx) => {
  return coordinator.isReady()
    ? ctx.json({ status: "ready" })
    : ctx.json({ status: coordinator.getState() }, 503);
});
```

## 优雅排流

部署滚动更新时，标记实例为排流状态以停止接收新流量：

```typescript
// SIGTERM 处理
process.on("SIGTERM", async () => {
  coordinator.markDraining(); // readiness 探针返回 503
  await waitForInflightRequests();
  coordinator.markStopped();  // liveness 探针也返回 503
  process.exit(0);
});
```

## 实例元数据

```typescript
coordinator.getInstanceId();  // UUID
coordinator.setMetadata("version", "1.2.0");
coordinator.getMetadata();
// { startedAt: 1715000000000, pid: 1234, version: "1.2.0" }
```

## 实例状态

| 状态 | `isLive()` | `isReady()` | 说明 |
|------|-----------|-------------|------|
| `starting` | `true` | `false` | 启动中 |
| `ready` | `true` | `true` | 就绪，正常接收流量 |
| `draining` | `true` | `false` | 排流中，停止接收新请求 |
| `stopped` | `false` | `false` | 已停止 |

## 接口方法

| 方法 | 说明 |
|------|------|
| `getState()` | 获取当前状态 |
| `setState(state)` | 直接设置状态 |
| `isReady()` | 是否就绪 |
| `isLive()` | 是否存活 |
| `markReady()` | 标记为就绪 |
| `markDraining()` | 标记为排流 |
| `markStopped()` | 标记为停止 |
| `getInstanceId()` | 获取实例唯一 ID |
| `getMetadata()` / `setMetadata()` | 读写实例元数据 |

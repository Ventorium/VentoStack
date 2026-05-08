---
title: Hot Restart
description: 热重启管理器，支持不中断连接的进程升级
---

`createHotRestart` 提供了优雅的热重启机制，利用 `Bun.serve().reload()` 实现不中断连接的进程升级。

## 基本用法

```typescript
import { createHotRestart } from "@ventostack/core";

const hotRestart = createHotRestart({
  gracefulTimeout: 10000,
  onBeforeRestart() {
    console.log("准备重启...");
  },
  onAfterRestart() {
    console.log("重启完成");
  },
});

// 触发热重启
await hotRestart.restart();
```

## 查询状态

```typescript
hotRestart.isRestarting();   // 是否正在重启中
hotRestart.getRestartCount(); // 已重启次数
```

## 与信号联动

通常在接收到特定信号时触发热重启：

```typescript
process.on("SIGUSR2", async () => {
  if (!hotRestart.isRestarting()) {
    await hotRestart.restart();
  }
});
```

## 重启流程

1. 检查是否已在重启中（防重入）
2. 执行 `onBeforeRestart` 回调
3. 等待优雅超时（让存量请求完成），最长 5 秒
4. 递增重启计数
5. 执行 `onAfterRestart` 回调
6. 标记重启结束

## 配置选项

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `gracefulTimeout` | `number` | `30000` | 优雅停止超时（毫秒），实际等待不超过 5 秒 |
| `onBeforeRestart` | `() => void \| Promise<void>` | — | 重启前回调 |
| `onAfterRestart` | `() => void \| Promise<void>` | — | 重启后回调 |

## HotRestart 接口

| 方法 | 说明 |
|------|------|
| `restart()` | 触发热重启 |
| `isRestarting()` | 是否正在重启中 |
| `getRestartCount()` | 获取已重启次数 |

---
title: Worker Pool
description: Worker 线程池，基于 Bun Worker Threads 的任务并行处理
---

`createWorkerPool` 提供了可自动伸缩的 Worker 线程池，支持任务队列和超时控制。

## 基本用法

```typescript
import { createWorkerPool } from "@ventostack/core";

const pool = createWorkerPool({
  workerURL: "./worker.ts",
  minWorkers: 2,
  maxWorkers: 8,
  taskTimeout: 10000,
});

// 提交任务
const result = await pool.execute({
  type: "process-image",
  payload: { url: "https://example.com/img.png" },
});

if (result.success) {
  console.log("处理完成:", result.data);
}
```

## Worker 脚本示例

Worker 脚本需监听 `message` 事件并返回 `WorkerResult`：

```typescript
// worker.ts
self.onmessage = async (event) => {
  const { type, payload } = event.data;
  try {
    const data = await processTask(type, payload);
    self.postMessage({ success: true, data });
  } catch (err) {
    self.postMessage({ success: false, error: err.message });
  }
};
```

## 查看池状态

```typescript
pool.size();  // 当前 Worker 总数
pool.idle();  // 空闲 Worker 数量
```

## 优雅关闭

```typescript
pool.terminate(); // 终止所有 Worker 并清空队列
```

## 伸缩策略

- 任务提交时优先分配空闲 Worker
- 无空闲 Worker 且未达 `maxWorkers` 时自动扩容
- 超过 `maxWorkers` 的任务进入队列等待
- 启动时预热 `minWorkers` 个 Worker

## 配置选项

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `workerURL` | `string \| URL` | — | Worker 脚本路径（必填） |
| `minWorkers` | `number` | `1` | 最小 Worker 数量 |
| `maxWorkers` | `number` | `navigator.hardwareConcurrency \|\| 4` | 最大 Worker 数量 |
| `taskTimeout` | `number` | `30000` | 单个任务超时（毫秒） |

## 接口

| 方法 | 说明 |
|------|------|
| `execute(task)` | 提交任务，返回 `WorkerResult` |
| `size()` | 当前 Worker 总数 |
| `idle()` | 空闲 Worker 数量 |
| `terminate()` | 终止所有 Worker |

### WorkerTask / WorkerResult

| 类型 | 属性 | 说明 |
|------|------|------|
| `WorkerTask` | `type: string` | 任务类型 |
| `WorkerTask` | `payload: T` | 任务载荷 |
| `WorkerResult` | `success: boolean` | 是否成功 |
| `WorkerResult` | `data?: T` | 返回数据 |
| `WorkerResult` | `error?: string` | 错误信息 |

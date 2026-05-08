---
order: 2
title: 定时任务
description: 使用 createScheduler 管理间隔和 cron 定时任务
---

`createScheduler` 提供了基于 cron 表达式和固定间隔的任务调度功能。基于 `setInterval` 实现，任务错误不会导致调度器崩溃。

## 基本用法

```typescript
import { createScheduler } from "@ventostack/events";

const scheduler = createScheduler();

// 每 5 分钟执行
scheduler.schedule(
  { name: "cleanup", interval: 5 * 60_000 },
  async () => {
    console.log("执行清理任务...");
  }
);

// 使用 cron 表达式（每天凌晨 2 点）
scheduler.schedule(
  { name: "daily-report", cron: "0 2 * * *" },
  async () => {
    await generateDailyReport();
  }
);

// 注册时立即执行一次
scheduler.schedule(
  { name: "warmup", interval: 60_000, immediate: true },
  async () => {
    await warmupCache();
  }
);
```

## 在应用中启动和停止

```typescript
const scheduler = createScheduler();

// 注册任务
scheduler.schedule(
  { name: "health-ping", cron: "* * * * *" },
  async () => {
    await healthCheck.ping();
  }
);

// 停止所有任务
app.lifecycle.onBeforeStop(async () => {
  scheduler.stopAll();
  console.log("调度器已停止");
});
```

## 管理任务

```typescript
// 列出所有任务
const tasks = scheduler.list();
for (const task of tasks) {
  console.log(`${task.name}: ${task.running ? "运行中" : "已停止"}`);
}

// 停止单个任务
const task = scheduler.schedule(
  { name: "temp-task", interval: 10_000 },
  async () => { /* ... */ }
);

task.stop();
console.log(task.running); // false
```

## 支持的 Cron 表达式

调度器支持简化的 cron 子集：

| 表达式 | 含义 | 实际间隔 |
|---|---|---|
| `* * * * *` | 每分钟 | 60 秒 |
| `*/N * * * *` | 每 N 分钟 | N × 60 秒 |
| `0 * * * *` | 每小时 | 3600 秒 |
| `0 */N * * *` | 每 N 小时 | N × 3600 秒 |
| `0 0 * * *` | 每天 | 86400 秒 |

其他格式回退到每分钟（60 秒）。

## Scheduler 接口

```typescript
interface ScheduleOptions {
  name: string;
  cron?: string;
  interval?: number;
  immediate?: boolean;
}

interface ScheduledTask {
  readonly name: string;
  stop(): void;
  readonly running: boolean;
}

interface Scheduler {
  schedule(options: ScheduleOptions, handler: () => Promise<void> | void): ScheduledTask;
  stopAll(): void;
  list(): ReadonlyArray<ScheduledTask>;
}
```

## 注意事项

- 任务名称 `name` 用于标识任务，方便调试和日志追踪。
- `schedule` 的 `cron` 和 `interval` 必须至少指定一个。
- 任务执行过程中的错误会被捕获并静默处理，不会导致调度器崩溃。
- `immediate: true` 会在注册时立即触发一次执行（fire-and-forget，错误同样被捕获）。

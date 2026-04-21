---
title: 定时任务
description: 使用 createScheduler 管理 cron 和一次性定时任务
---

`createScheduler` 提供了基于 cron 表达式和延迟的任务调度功能。

## 基本用法

```typescript
import { createScheduler } from "@aeron/events";

const scheduler = createScheduler();

// cron 任务（每天凌晨 2 点）
scheduler.cron("cleanup", "0 2 * * *", async () => {
  await db.delete("expired_sessions").where("expires_at", "<", new Date()).execute();
  console.log("过期会话已清理");
});

// 每分钟执行
scheduler.cron("health-ping", "* * * * *", async () => {
  await healthCheck.ping();
});

// 一次性延迟任务
scheduler.delay("send-reminder", 3600_000, async () => {
  await email.send({ to: "user@example.com", subject: "订单提醒" });
});
```

## 在应用中启动和停止

```typescript
const app = createApp({ port: 3000 });
const scheduler = createScheduler();

// 注册任务
scheduler.cron("daily-report", "0 8 * * *", async () => {
  await generateDailyReport();
});

app.onStart(async () => {
  scheduler.start();
  console.log("调度器已启动");
});

app.onStop(async () => {
  await scheduler.stop();
  console.log("调度器已停止");
});
```

## 任务错误处理

```typescript
scheduler.cron("risky-task", "*/5 * * * *", async () => {
  await riskyOperation();
}, {
  onError: (err) => {
    logger.error("定时任务失败", { task: "risky-task", error: err.message });
  }
});
```

## Scheduler 接口

```typescript
interface SchedulerTaskOptions {
  onError?: (err: Error) => void;
  runOnInit?: boolean;  // 是否在注册时立即执行一次
}

interface Scheduler {
  cron(name: string, expression: string, fn: () => void | Promise<void>, options?: SchedulerTaskOptions): void;
  delay(name: string, ms: number, fn: () => void | Promise<void>): void;
  cancel(name: string): void;
  start(): void;
  stop(): Promise<void>;
}
```

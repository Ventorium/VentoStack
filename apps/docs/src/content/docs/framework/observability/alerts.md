---
order: 4
title: 错误上报
description: 使用 createErrorReporter 配置多通道错误上报
---

`createErrorReporter` 提供了多通道错误上报能力，支持采样率控制、忽略模式与环境/服务标识。内置 Sentry、钉钉 Webhook、通用 Webhook 三种通道。

## 基本用法

```typescript
import { createErrorReporter, createDingTalkChannel } from "@ventostack/observability";

const reporter = createErrorReporter({
  channels: [
    createDingTalkChannel(process.env.DINGTALK_WEBHOOK_URL!),
  ],
  sampleRate: 1.0,
  environment: "production",
  serviceName: "api-server",
});
```

## 上报错误

```typescript
// 普通错误
try {
  await riskyOperation();
} catch (err) {
  await reporter.capture(err, { userId: "123" });
}

// 警告
await reporter.captureWarning("磁盘使用率超过 80%", { disk: "/data" });

// 致命错误
await reporter.captureFatal(new Error("数据库连接断开"), { db: "primary" });
```

## 配置采样与忽略

```typescript
const reporter = createErrorReporter({
  channels: [createSentryChannel(process.env.SENTRY_DSN!)],
  sampleRate: 0.5,              // 只上报 50% 的错误
  ignorePatterns: [/ECONNREFUSED/, /timeout/],
  environment: process.env.NODE_ENV,
  serviceName: "my-service",
});
```

## 内置通道

```typescript
import {
  createSentryChannel,
  createDingTalkChannel,
  createWebhookChannel,
} from "@ventostack/observability";

// Sentry
const sentry = createSentryChannel("https://...@sentry.io/...");

// 钉钉
const dingtalk = createDingTalkChannel("https://oapi.dingtalk.com/robot/send?access_token=...");

// 通用 Webhook
const webhook = createWebhookChannel("https://alerts.example.com/webhook", {
  "X-Api-Key": "secret",
});
```

## ErrorReporter 接口

```typescript
interface ErrorReporterConfig {
  channels: ErrorChannel[];
  sampleRate?: number;
  ignorePatterns?: RegExp[];
  environment?: string;
  serviceName?: string;
}

interface ErrorChannel {
  name: string;
  report(error: ErrorReport): Promise<void>;
}

interface ErrorReport {
  message: string;
  stack?: string;
  level: "error" | "warning" | "fatal";
  timestamp: number;
  context?: Record<string, unknown>;
  environment?: string;
  serviceName?: string;
}

interface ErrorReporter {
  capture(error: Error | string, context?: Record<string, unknown>, level?: ErrorReport["level"]): Promise<void>;
  captureWarning(message: string, context?: Record<string, unknown>): Promise<void>;
  captureFatal(error: Error | string, context?: Record<string, unknown>): Promise<void>;
}
```

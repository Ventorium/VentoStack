---
title: 告警系统
description: 使用 createAlertManager 配置应用告警规则
---

`createAlertManager` 提供了基于阈值和规则的告警系统，支持多种通知渠道。

## 基本用法

```typescript
import { createAlertManager } from "@aeron/observability";

const alertManager = createAlertManager({
  channels: {
    slack: {
      type: "webhook",
      url: process.env.SLACK_WEBHOOK_URL!,
    },
    email: {
      type: "email",
      to: ["ops@example.com"],
    },
  },
});
```

## 定义告警规则

```typescript
// 错误率告警
alertManager.addRule({
  name: "high-error-rate",
  condition: async () => {
    const errorCount = await metrics.get("http_requests_total", { status: "500" });
    const totalCount = await metrics.get("http_requests_total");
    return errorCount / totalCount > 0.05; // 错误率超过 5%
  },
  severity: "critical",
  channels: ["slack", "email"],
  message: "HTTP 错误率超过 5%，请立即检查！",
  cooldown: 300_000, // 5 分钟内不重复告警
});

// 响应时间告警
alertManager.addRule({
  name: "slow-response",
  condition: async () => {
    const p99Latency = await metrics.getPercentile("http_request_duration_ms", 99);
    return p99Latency > 2000; // P99 超过 2 秒
  },
  severity: "warning",
  channels: ["slack"],
  message: "P99 响应时间超过 2 秒",
});
```

## 手动触发告警

```typescript
await alertManager.fire({
  rule: "deployment-failed",
  severity: "critical",
  message: "生产环境部署失败",
  context: { version: "1.2.3", environment: "production" },
});
```

## 启动告警检查

```typescript
app.onStart(() => {
  alertManager.start(60_000); // 每分钟检查一次
});

app.onStop(async () => {
  alertManager.stop();
});
```

## AlertManager 接口

```typescript
type AlertSeverity = "info" | "warning" | "critical";

interface AlertRule {
  name: string;
  condition: () => boolean | Promise<boolean>;
  severity: AlertSeverity;
  channels: string[];
  message: string;
  cooldown?: number;
}

interface AlertManager {
  addRule(rule: AlertRule): void;
  fire(alert: { rule: string; severity: AlertSeverity; message: string; context?: unknown }): Promise<void>;
  start(intervalMs: number): void;
  stop(): void;
}
```

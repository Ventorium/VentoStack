---
title: 健康检查
description: 使用 createHealthCheck 为应用添加健康检查端点
---

`createHealthCheck` 提供了标准的健康检查功能，可以集成 Kubernetes、Docker Swarm 等编排工具的存活探针和就绪探针。

## 基本用法

```typescript
import { createApp, createRouter, createHealthCheck } from "@aeron/core";

const health = createHealthCheck();
const router = createRouter();

// 注册健康检查路由
router.get("/health", async (ctx) => {
  const result = await health.check();
  return ctx.json(result, result.healthy ? 200 : 503);
});
```

## 自定义检查项

```typescript
import { createHealthCheck } from "@aeron/core";

const health = createHealthCheck();

// 注册数据库检查
health.addCheck("database", async () => {
  try {
    await db.query("SELECT 1");
    return { healthy: true };
  } catch (err) {
    return { healthy: false, message: "数据库连接失败" };
  }
});

// 注册缓存检查
health.addCheck("cache", async () => {
  try {
    await cache.set("__health__", "ok", 10);
    const val = await cache.get("__health__");
    return { healthy: val === "ok" };
  } catch (err) {
    return { healthy: false, message: "缓存不可用" };
  }
});

// 注册外部服务检查
health.addCheck("payment-service", async () => {
  try {
    const res = await fetch("https://payment.example.com/health", {
      signal: AbortSignal.timeout(3000)
    });
    return { healthy: res.ok };
  } catch (err) {
    return { healthy: false, message: "支付服务不可达" };
  }
});
```

## 分离存活和就绪检查

Kubernetes 推荐分离两种检查：

```typescript
const router = createRouter();

// liveness probe - 检查应用是否在运行
router.get("/health/live", async (ctx) => {
  return ctx.json({ status: "alive" }, 200);
});

// readiness probe - 检查应用是否准备好接收流量
router.get("/health/ready", async (ctx) => {
  const result = await health.check();
  return ctx.json(result, result.healthy ? 200 : 503);
});
```

## 健康检查响应格式

```json
{
  "healthy": true,
  "timestamp": "2024-01-01T00:00:00.000Z",
  "checks": {
    "database": { "healthy": true },
    "cache": { "healthy": true },
    "payment-service": { "healthy": false, "message": "支付服务不可达" }
  }
}
```

整体 `healthy` 为 `false` 当且仅当任意一个检查项返回 `healthy: false`。

## Kubernetes 配置示例

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 30

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
```

## HealthCheck 接口

```typescript
interface HealthCheck {
  addCheck(name: string, fn: () => Promise<HealthCheckResult>): void;
  check(): Promise<HealthCheckReport>;
}

interface HealthCheckResult {
  healthy: boolean;
  message?: string;
  data?: unknown;
}

interface HealthCheckReport {
  healthy: boolean;
  timestamp: string;
  checks: Record<string, HealthCheckResult>;
}
```

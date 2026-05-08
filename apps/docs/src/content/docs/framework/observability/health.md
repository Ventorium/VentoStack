---
order: 10
title: 健康检查
description: 使用 createHealthCheck 为应用添加存活探针和就绪探针
---

`createHealthCheck` 提供两类健康检查能力：

- `live()`：存活探针，只表示进程仍然存活
- `ready()`：就绪探针，会执行已注册的检查项并聚合结果

## 基本用法

```typescript
import { createRouter } from "@ventostack/core";
import { createHealthCheck } from "@ventostack/observability";

const health = createHealthCheck();
const router = createRouter();

health.addCheck("db", async () => {
  try {
    await db.raw("SELECT 1");
    return true;
  } catch {
    return "Database connection failed";
  }
});

router.get("/health/live", (ctx) => {
  return ctx.json(health.live());
});

router.get("/health/ready", async (ctx) => {
  const status = await health.ready();
  const code = status.status === "ok" ? 200 : 503;
  return ctx.json(status, code);
});
```

## 自定义检查项

`addCheck(name, checker)` 的 `checker` 返回值规则如下：

- 返回 `true`：表示检查通过
- 返回 `string`：表示检查失败，字符串会作为错误消息
- 抛出异常：框架会捕获并转换成失败状态

```typescript
import { createHealthCheck } from "@ventostack/observability";

const health = createHealthCheck();

health.addCheck("database", async () => {
  try {
    await db.raw("SELECT 1");
    return true;
  } catch {
    return "数据库连接失败";
  }
});

health.addCheck("cache", async () => {
  try {
    await cache.set("__health__", "ok", 10);
    const val = await cache.get("__health__");
    return val === "ok" ? true : "缓存检查失败";
  } catch {
    return "缓存不可用";
  }
});

health.addCheck("payment-service", async () => {
  try {
    const res = await fetch("https://payment.example.com/health", {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok ? true : `支付服务返回 ${res.status}`;
  } catch {
    return "支付服务不可达";
  }
});
```

## live 与 ready 的区别

```typescript
router.get("/health/live", (ctx) => {
  return ctx.json(health.live());
});

router.get("/health/ready", async (ctx) => {
  const status = await health.ready();
  const code = status.status === "ok" ? 200 : 503;
  return ctx.json(status, code);
});
```

- `/health` 适合 liveness probe
- `/health/ready` 适合 readiness probe

`ready()` 的整体状态有 3 种：

- `ok`：全部检查通过，或没有注册任何检查
- `degraded`：部分检查失败
- `error`：全部检查失败

## 健康检查响应格式

### `health.live()`

```json
{
  "status": "ok"
}
```

### `health.ready()`


```json
{
  "status": "ok",
  "checks": {
    "[addCheck的第一个参数]": {
      "status": "ok",
      "duration": 0.69
    }
  },
  "uptime": 18104
}
```

每个检查项都会包含：

- `status`：`ok` 或 `error`
- `message`：失败时的错误信息
- `duration`：本次检查耗时，单位毫秒

`checks` 里的字段名不会被框架改写，`addCheck("db", ...)` 就返回 `"db"`，`addCheck("database", ...)` 就返回 `"database"`。

## Kubernetes 配置示例

```yaml
livenessProbe:
  httpGet:
    path: /health
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
  addCheck(name: string, checker: () => Promise<boolean | string>): void;
  live(): { status: "ok" };
  ready(): Promise<HealthStatus>;
}

interface HealthStatus {
  status: "ok" | "degraded" | "error";
  checks: Record<string, CheckResult>;
  uptime: number;
}

interface CheckResult {
  status: "ok" | "error";
  message?: string;
  duration?: number;
}
```

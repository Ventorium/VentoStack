---
order: 2
title: 指标收集
description: 使用 createMetrics 收集应用性能指标
---

`createMetrics` 提供了计数器、直方图和仪表盘三种指标类型，兼容 Prometheus 文本格式输出。

## 基本用法

```typescript
import { createMetrics } from "@ventostack/observability";

const metrics = createMetrics();

// 计数器（只增不减，如请求总数）
const httpRequests = metrics.counter("http_requests_total", "HTTP 请求总数");

// 仪表盘（可增可减，如当前连接数）
const activeConnections = metrics.gauge("active_connections", "当前活跃连接数");

// 直方图（分布统计，如请求延迟）
const requestLatency = metrics.histogram(
  "http_request_duration_seconds",
  "请求处理时间（秒）",
  [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
);
```

## 收集指标

```typescript
// 请求计数
httpRequests.inc({ method: "GET", path: "/users", status: "200" });
httpRequests.inc({ method: "GET", path: "/users", status: "200" }, 5); // 增加 5

// 活跃连接（支持标签维度）
activeConnections.set(42, { region: "us-east" });
activeConnections.inc({ region: "us-east" });
activeConnections.dec({ region: "us-east" });

// 获取指定标签的值
const count = activeConnections.get({ region: "us-east" });

// 延迟直方图
const start = performance.now();
// ... 处理请求 ...
requestLatency.observe((performance.now() - start) / 1000, { method: "GET", path: "/users" });
```

## 中间件集成

```typescript
const metricsMiddleware: Middleware = async (ctx, next) => {
  const start = performance.now();
  activeConnections.inc();

  try {
    await next();
    httpRequests.inc({
      method: ctx.method,
      path: ctx.path,
      status: "200",
    });
  } catch (err) {
    httpRequests.inc({
      method: ctx.method,
      path: ctx.path,
      status: "500",
    });
    throw err;
  } finally {
    requestLatency.observe((performance.now() - start) / 1000, {
      method: ctx.method,
      path: ctx.path,
    });
    activeConnections.dec();
  }
};
```

## 暴露 Prometheus 端点

```typescript
// 提供 /metrics 端点供 Prometheus 抓取
router.get("/metrics", async (ctx) => {
  const data = metrics.render();
  return new Response(data, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
});
```

Prometheus 抓取后的格式：

```
# HELP http_requests_total HTTP 请求总数
# TYPE http_requests_total counter
http_requests_total{method="GET",path="/users",status="200"} 1234
http_requests_total{method="POST",path="/users",status="201"} 56

# HELP http_request_duration_seconds 请求处理时间（秒）
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.01",method="GET",path="/users"} 100
http_request_duration_seconds_bucket{le="0.05",method="GET",path="/users"} 500
...
```

## 完全禁用指标

```typescript
const metrics = createMetrics({ enabled: false });
// 所有指标方法均为 no-op，不产生任何副作用
```

## 配置选项

```typescript
const metrics = createMetrics({
  prefix: "myapp",                              // 指标名前缀
  defaultBuckets: [0.005, 0.01, 0.025, 0.05], // 直方图默认分桶
});
```

## Metrics 接口

```typescript
interface Metrics {
  counter(name: string, help?: string): Counter;
  histogram(name: string, help?: string, buckets?: number[]): Histogram;
  gauge(name: string, help?: string): Gauge;
  render(): string;   // Prometheus 文本格式
  reset(): void;      // 清空所有指标
}

interface Counter {
  inc(labels?: Record<string, string>, value?: number): void;
  get(labels?: Record<string, string>): number;
}

interface Histogram {
  observe(value: number, labels?: Record<string, string>): void;
  get(labels?: Record<string, string>): HistogramSnapshot;
}

interface HistogramSnapshot {
  count: number;
  sum: number;
  buckets: Map<number, number>;
}

interface Gauge {
  set(value: number, labels?: Record<string, string>): void;
  inc(labels?: Record<string, string>): void;
  dec(labels?: Record<string, string>): void;
  get(labels?: Record<string, string>): number;
  reset(): void;
}
```

## 注意事项

- 当前 `createMetrics` 不支持 `export(format)` 方法，仅提供 `render()` 输出 Prometheus 格式
- Gauge 由 `createGauge()` 独立实现，支持 `set` / `inc` / `dec` / `reset` / `get`
- 指标数据存储在内存中，进程重启后丢失

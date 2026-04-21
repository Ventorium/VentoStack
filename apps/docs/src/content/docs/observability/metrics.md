---
title: 指标收集
description: 使用 createMetricsCollector 收集应用性能指标
---

`createMetricsCollector` 提供了计数器、仪表盘和直方图等指标类型，兼容 Prometheus 格式输出。

## 基本用法

```typescript
import { createMetricsCollector } from "@aeron/observability";

const metrics = createMetricsCollector();

// 计数器（只增不减，如请求总数）
const httpRequests = metrics.counter("http_requests_total", {
  description: "HTTP 请求总数",
  labels: ["method", "path", "status"],
});

// 仪表盘（可增可减，如当前连接数）
const activeConnections = metrics.gauge("active_connections", {
  description: "当前活跃连接数",
});

// 直方图（分布统计，如请求延迟）
const requestLatency = metrics.histogram("http_request_duration_ms", {
  description: "请求处理时间（毫秒）",
  buckets: [10, 50, 100, 250, 500, 1000, 2500],
  labels: ["method", "path"],
});
```

## 收集指标

```typescript
// 请求计数
httpRequests.increment({ method: "GET", path: "/users", status: "200" });

// 活跃连接
activeConnections.set(currentConnections);
activeConnections.increment();
activeConnections.decrement();

// 延迟直方图
const start = Date.now();
// ... 处理请求 ...
requestLatency.observe(Date.now() - start, { method: "GET", path: "/users" });
```

## 中间件集成

```typescript
const metricsMiddleware: Middleware = async (ctx, next) => {
  const start = Date.now();
  activeConnections.increment();

  try {
    await next();
    httpRequests.increment({
      method: ctx.method,
      path: ctx.path,
      status: "200",
    });
  } catch (err) {
    httpRequests.increment({
      method: ctx.method,
      path: ctx.path,
      status: "500",
    });
    throw err;
  } finally {
    requestLatency.observe(Date.now() - start, {
      method: ctx.method,
      path: ctx.path,
    });
    activeConnections.decrement();
  }
};
```

## 暴露 Prometheus 端点

```typescript
// 提供 /metrics 端点供 Prometheus 抓取
router.get("/metrics", async (ctx) => {
  const data = metrics.export("prometheus");
  return new Response(data, {
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
});
```

Prometheus 抓取后的格式：
```
# HELP http_requests_total HTTP 请求总数
# TYPE http_requests_total counter
http_requests_total{method="GET",path="/users",status="200"} 1234
http_requests_total{method="POST",path="/users",status="201"} 56

# HELP http_request_duration_ms 请求处理时间（毫秒）
# TYPE http_request_duration_ms histogram
http_request_duration_ms_bucket{le="10",method="GET",path="/users"} 100
http_request_duration_ms_bucket{le="50",method="GET",path="/users"} 500
...
```

## MetricsCollector 接口

```typescript
interface MetricsCollector {
  counter(name: string, options: MetricOptions): Counter;
  gauge(name: string, options: MetricOptions): Gauge;
  histogram(name: string, options: HistogramOptions): Histogram;
  export(format: "prometheus" | "json"): string;
}
```

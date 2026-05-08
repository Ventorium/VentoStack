---
title: Interceptor
description: 三层管线模型：Filter → Interceptor → Middleware，细粒度控制请求处理流程
---

`createPipeline` 提供了 Filter、Interceptor、Middleware 三层管线，按顺序执行：

**Filter（过滤）→ Interceptor.before → Middleware 链 → Handler → Interceptor.after**

## 基本用法

```typescript
import { createPipeline } from "@ventostack/core";

const pipeline = createPipeline();

// 添加过滤器（纯布尔判断）
pipeline.addFilter({
  name: "ip-filter",
  apply(ctx) {
    return ctx.headers.get("x-forwarded-for") !== "blocked-ip";
  },
});

// 添加拦截器（可在 handler 前后操作）
pipeline.addInterceptor({
  name: "timing",
  before(ctx) {
    ctx.state.startTime = performance.now();
  },
  after(ctx, response) {
    const ms = performance.now() - ctx.state.startTime;
    const headers = new Headers(response.headers);
    headers.set("X-Response-Time", `${ms.toFixed(2)}ms`);
    return new Response(response.body, {
      status: response.status,
      headers,
    });
  },
});

// 转换为中间件使用
app.use(pipeline.toMiddleware());
```

## Filter 拒绝请求

Filter 返回 `false` 时自动返回 `403`，返回 `Response` 对象则直接短路：

```typescript
pipeline.addFilter({
  name: "maintenance",
  apply(ctx) {
    if (isMaintenanceMode()) {
      return new Response("Service Unavailable", { status: 503 });
    }
    return true;
  },
});
```

## Interceptor 短路

`before` 返回 `Response` 即跳过后续处理：

```typescript
pipeline.addInterceptor({
  name: "auth",
  before(ctx) {
    if (!ctx.headers.get("authorization")) {
      return ctx.json({ error: "Unauthorized" }, 401);
    }
  },
});
```

## 配置选项

### Filter

| 属性/方法 | 说明 |
|-----------|------|
| `name` | 过滤器名称 |
| `apply(ctx)` | 返回 `true` 通过；`false` 或 `Response` 拒绝 |

### Interceptor

| 属性/方法 | 说明 |
|-----------|------|
| `name` | 拦截器名称 |
| `before?(ctx)` | handler 前执行，返回 `Response` 可短路 |
| `after?(ctx, response)` | handler 后执行，可修改响应 |

### Pipeline

| 方法 | 说明 |
|------|------|
| `addFilter(filter)` | 添加过滤器 |
| `addInterceptor(interceptor)` | 添加拦截器 |
| `addMiddleware(middleware)` | 添加中间件 |
| `toMiddleware()` | 将管线编译为单个中间件函数 |

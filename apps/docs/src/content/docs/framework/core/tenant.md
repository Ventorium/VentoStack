---
order: 20
title: 多租户中间件
description: 使用 createTenantMiddleware 实现多租户架构，支持从请求头、子域名或路径解析租户
---

## 概述

`createTenantMiddleware` 创建多租户中间件，支持从请求头、子域名、URL 路径或自定义函数中解析租户标识。解析到的 `tenantId` 会挂载到 `ctx.tenant`，并自动在响应头中返回。

## 基本用法

```typescript
import { createTenantMiddleware } from "@ventostack/core";

// 从请求头解析
const { middleware } = createTenantMiddleware({
  strategy: "header",
  headerName: "x-tenant-id",
});
app.use(middleware);

// 从子域名解析 (tenant.example.com)
const { middleware } = createTenantMiddleware({ strategy: "subdomain" });

// 从路径解析 (/tenant1/api/users)
const { middleware } = createTenantMiddleware({ strategy: "path" });
```

## 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `strategy` | `"header" \| "subdomain" \| "path" \| "custom"` | **必填** | 租户解析策略 |
| `headerName` | `string` | `"x-tenant-id"` | header 策略下的请求头名称 |
| `customResolver` | `(req: Request) => string \| null` | — | custom 策略下的自定义解析函数 |
| `validateTenant` | `(tenantId: string, ctx: Context) => Promise<boolean>` | — | 异步租户校验，返回 `false` 拒绝访问 |

完整类型定义：

```typescript
interface TenantResolverOptions {
  strategy: "header" | "subdomain" | "path" | "custom";
  headerName?: string;
  customResolver?: (req: Request) => string | null;
  validateTenant?: (tenantId: string, ctx: Context) => Promise<boolean>;
}

function createTenantMiddleware(options: TenantResolverOptions): {
  middleware: Middleware;
  getTenantFromRequest(req: Request): string | null;
};
```

## 租户校验

```typescript
const { middleware } = createTenantMiddleware({
  strategy: "header",
  validateTenant: async (tenantId) => {
    const tenant = await db.tenants.findById(tenantId);
    return tenant !== null && tenant.active;
  },
});
```

校验失败返回 `403`，异常返回 `500`。

## 注意事项

- 缺少租户标识时返回 `400` 响应
- 解析结果存储在 `ctx.tenant.tenantId`，后续中间件可直接访问
- 响应头中自动附加 `x-tenant-id`
- 子域名策略要求至少三段域名（如 `tenant.example.com`）
- `getTenantFromRequest` 可单独用于非中间件场景

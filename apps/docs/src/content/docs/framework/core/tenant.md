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

### Admin 应用租户配置

Admin 应用通过环境变量 `TENANT_ENABLED` 控制是否启用多租户：

```bash
# .env
TENANT_ENABLED=true
```

启用后：
1. 自动注册 `createTenantMiddleware`，从请求头 `x-tenant-id` 提取租户 ID
2. QueryBuilder 自动注入 `tenant_id` WHERE 条件：

```typescript
// 启用租户后，所有查询自动添加 tenant_id 条件
const users = await db.query(UserModel)
  .withTenant("tenant-abc")
  .where("status", "=", "active")
  .list();
// 生成 SQL: WHERE tenant_id = $1 AND status = $2 AND deleted_at IS NULL
// 参数: ["tenant-abc", "active"]
```

3. 缓存键自动添加 `tenant:${tenantId}:` 前缀

### QueryBuilder withTenant()

```typescript
interface QueryBuilder<T> {
  /** 设置租户 ID，自动在 WHERE 条件中注入 tenant_id = $N */
  withTenant(tenantId: string): QueryBuilder<T>;
}
```

- `tenant_id` 条件作为 WHERE 子句的第一个条件注入
- 使用参数化查询（不是字符串拼接）
- 列名通过 `assertValidIdentifier()` 校验

---
order: 11
title: 行级数据过滤
description: 使用 createRowFilter 根据用户/租户上下文自动生成 SQL WHERE 条件实现行级隔离
---

`createRowFilter` 提供了行级数据过滤能力，根据用户 / 租户上下文自动生成 SQL WHERE 子句，实现多租户数据行级隔离。支持静态值、用户属性和租户属性三种值来源。

## 基本用法

```typescript
import { createRowFilter } from "@ventostack/auth";

const filter = createRowFilter();

// 规则：orders 表按 tenant_id 过滤
filter.addRule({
  resource: "orders",
  field: "tenant_id",
  operator: "eq",
  valueFrom: "tenant",
  value: "tenantId",
});

// 规则：posts 表按 author_id 过滤
filter.addRule({
  resource: "posts",
  field: "author_id",
  operator: "eq",
  valueFrom: "user",
  value: "userId",
});

// 通配资源：所有表按 status 过滤
filter.addRule({
  resource: "*",
  field: "deleted",
  operator: "eq",
  valueFrom: "static",
  value: "false",
});
```

## 生成 WHERE 子句

```typescript
const filter = rowFilter.buildWhereClause();
// filter.sql: "WHERE tenant_id = $1 AND deleted_at IS NULL"
// filter.params: ["tenant-abc"]

// 执行参数化查询
const rows = await db.raw(filter.sql, filter.params);
```

## 获取过滤条件

```typescript
const clauses = filter.getFilters("orders", {
  tenantId: "tenant-abc",
});
// [{ field: "tenant_id", operator: "=", value: "tenant-abc" }, { field: "deleted", ... }]
```

## 值来源

| `valueFrom` | 说明 | `value` 含义 |
|-------------|------|-------------|
| `"user"` | 从上下文取用户 ID | 属性路径（如 `"userId"`） |
| `"tenant"` | 从上下文取租户 ID | 属性路径（如 `"tenantId"`） |
| `"static"` | 静态值 | 直接使用的值 |

## 操作符

| 操作符 | SQL 映射 | 说明 |
|--------|---------|------|
| `eq` | `=` | 等于 |
| `neq` | `!=` | 不等于 |
| `in` | `IN` | 包含于 |
| `not_in` | `NOT IN` | 不包含于 |

## 安全机制

- 字段名经过安全校验（仅允许字母、数字、下划线和点号），防止 SQL 注入
- 使用参数化查询（$1, $2 占位符 + params 数组），从根本上消除 SQL 注入风险
- 当过滤值为 `undefined` 或空数组时，返回 `WHERE 1 = 0`（拒绝所有数据）

## 接口参考

```typescript
interface ParameterizedClause {
  sql: string;       // WHERE 子句，含 $1, $2 占位符
  params: unknown[]; // 参数值数组
}

interface RowFilterRule {
  resource: string;        // 资源/表名，"*" 通配所有
  field: string;           // 过滤字段名
  operator: "eq" | "in" | "neq" | "not_in";
  valueFrom: "user" | "tenant" | "static";
  value: string;           // 静态值或属性路径
}

interface RowFilterContext {
  userId?: string;
  tenantId?: string;
  roles?: string[];
  attributes?: Record<string, unknown>;
}

interface RowFilter {
  addRule(rule: RowFilterRule): void;
  getFilters(resource: string, ctx: RowFilterContext): RowFilterClause[];
  getRules(): RowFilterRule[];
  buildWhereClause(resource: string, ctx: RowFilterContext): ParameterizedClause;
}
```

## 注意事项

- 过滤规则基于内存数组存储，重启后需重新注册
- 通配资源（`resource: "*"`）的规则会匹配所有资源名
- 建议将生成的 WHERE 子句与参数化查询结合使用，进一步提升安全性
- `buildWhereClause` 已内置参数化查询支持，返回 `ParameterizedClause`（含 `sql` 和 `params`），可直接传入数据库执行器

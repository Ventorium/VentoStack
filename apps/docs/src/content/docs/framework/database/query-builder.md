---
order: 2
title: 查询构建器
description: 使用 defineModel 和 db.query 构建完全类型安全的 SQL 查询
---

VentoStack 的查询构建器基于模型定义自动推导 TypeScript 类型，从 `db.query(Model).list()` 到返回结果的每一个字段都有完整类型提示。

## 定义模型

使用 `defineModel` 和 `column` 定义数据模型，列类型会自动映射到 TypeScript 类型：

```typescript
import { defineModel, column } from "@ventostack/database";

const UserModel = defineModel("users", {
  id: column.bigint({ primary: true, autoIncrement: true }),
  email: column.varchar({ length: 255, unique: true }),
  name: column.varchar({ length: 255 }),
  age: column.int({ nullable: true }),
  active: column.boolean({ default: true }),
  role: column.enum({ values: ["admin", "user"] as const }),
  metadata: column.json<{ tags: string[] }>(),
  createdAt: column.timestamp(),
});

// 推导出的用户类型：
// {
//   id: bigint;
//   email: string;
//   name: string;
//   age: number | null;
//   active: boolean;
//   role: "admin" | "user";
//   metadata: { tags: string[] };
//   createdAt: Date;
// }
```

### 列类型映射

| 列方法 | TypeScript 类型 | 说明 |
|--------|----------------|------|
| `column.bigint()` | `bigint` | 64 位整数 |
| `column.int()` | `number` | 32 位整数 |
| `column.varchar()` | `string` | 变长字符串 |
| `column.text()` | `string` | 长文本 |
| `column.boolean()` | `boolean` | 布尔值 |
| `column.timestamp()` | `Date` | 时间戳 |
| `column.json<T>()` | `T` | JSON 列，可指定泛型 |
| `column.enum({ values })` | 字面量联合 | 枚举值 |
| `column.decimal()` | `string` | 高精度小数（字符串存储避免精度丢失） |

### 可空列

`nullable: true` 会自动在 TypeScript 类型中加上 `| null`：

```typescript
const PostModel = defineModel("posts", {
  id: column.bigint({ primary: true, autoIncrement: true }),
  title: column.varchar({ length: 200 }),
  // publishedAt 可以是 null
  publishedAt: column.timestamp({ nullable: true }),
});

// 推导类型：{ id: bigint; title: string; publishedAt: Date | null }
```

## SELECT 查询

```typescript
const db = createDatabase({ url: process.env.DATABASE_URL! });

// 查询全部 — 返回完整类型数组
const users = await db.query(UserModel).list();
// users: { id: bigint; email: string; ... }[]

// 单条查询 — 返回完整类型或 undefined
const user = await db.query(UserModel).where("email", "=", "alice@example.com").get();
// user: { id: bigint; email: string; ... } | undefined

// 指定字段 — 返回部分类型
const names = await db.query(UserModel).select("id", "name").list();
// names: { id: bigint; name: string }[]
```

## WHERE 条件

```typescript
// 等值
const admin = await db.query(UserModel).where("role", "=", "admin").get();

// 比较
const adults = await db.query(UserModel).where("age", ">=", 18).list();

// LIKE
const matched = await db.query(UserModel).where("email", "LIKE", "%@example.com").list();

// IN
const selected = await db.query(UserModel).where("id", "IN", [1, 2, 3]).list();

// IS NULL
const unaged = await db.query(UserModel).where("age", "IS NULL").list();

// OR 条件
const result = await db.query(UserModel)
  .where("role", "=", "admin")
  .orWhere("active", "=", false)
  .list();
```

## 排序和分页

```typescript
const users = await db
  .query(UserModel)
  .where("active", "=", true)
  .orderBy("createdAt", "desc")
  .limit(20)
  .offset(40)
  .list();
```

## 聚合查询

```typescript
const total = await db.query(UserModel).where("active", "=", true).count();
// total: number

const avgAge = await db.query(UserModel).where("age", "IS NOT NULL").avg("age");
// avgAge: number

const sumAge = await db.query(UserModel).sum("age");
const minAge = await db.query(UserModel).min("age");
const maxAge = await db.query(UserModel).max("age");
```

## INSERT

```typescript
// 插入并返回完整记录
const newUser = await db.query(UserModel).insert(
  { email: "alice@example.com", name: "Alice", role: "user" },
  { returning: true },
);
// newUser: { id: bigint; email: string; name: string; ... } | undefined
```

## UPDATE

```typescript
// 更新并返回更新后的记录
const updated = await db
  .query(UserModel)
  .where("id", "=", 1)
  .update({ name: "Alice Smith" }, { returning: true });
// updated: { id: bigint; email: string; name: string; ... } | undefined
```

## DELETE

```typescript
// 硬删除
await db.query(UserModel).where("id", "=", 1).hardDelete();

// 软删除（模型需开启 softDelete: true）
await db.query(UserModel).where("id", "=", 1).delete();

// 恢复软删除记录
await db.query(UserModel).where("id", "=", 1).restore();
```

## 批量插入

```typescript
await db.query(UserModel).batchInsert([
  { email: "a@b.com", name: "A", role: "user" },
  { email: "c@d.com", name: "B", role: "admin" },
]);
```

## 分组与过滤

```typescript
const result = await db
  .query(UserModel)
  .select("role", "COUNT(*) as count")
  .groupBy("role")
  .having("count", ">", 5)
  .list();
```

## 乐观锁

```typescript
const updated = await db
  .query(UserModel)
  .where("id", "=", 1)
  .withVersion("version", 3)
  .update({ name: "Alice" }, { returning: true });
// 自动在 SET 中追加 version = version + 1，在 WHERE 中校验 version = 3
```

## 事务

```typescript
await db.transaction(async (tx) => {
  const user = await tx.query(UserModel).insert({ email: "a@b.com", name: "A", role: "user" });
  await tx.query(PostModel).insert({ title: "Hello", userId: user!.id });
});
```

## 原始 SQL

当查询构建器无法表达复杂查询时，可回退到原始 SQL：

```typescript
const rows = await db.raw("SELECT * FROM users WHERE age > $1", [18]);
// rows: unknown[] — 需自行断言类型
```

---
title: 查询构建器
description: 使用 createQueryBuilder 构建类型安全的 SQL 查询
---

`createQueryBuilder` 提供了流畅的链式 API 来构建 SQL 查询，无需手写 SQL 字符串，同时避免 SQL 注入。

## 初始化

```typescript
import { createQueryBuilder } from "@aeron/database";

const db = createQueryBuilder({
  url: process.env.DATABASE_URL!,
});
```

## SELECT 查询

```typescript
// 查询所有字段
const users = await db.from("users").execute();

// 指定字段
const users = await db
  .from("users")
  .select(["id", "name", "email"])
  .execute();

// 带条件
const activeUsers = await db
  .from("users")
  .select(["id", "name"])
  .where("active", "=", true)
  .where("role", "=", "user")
  .execute();
```

## WHERE 条件

```typescript
// 等值
.where("status", "=", "active")

// 比较
.where("age", ">", 18)
.where("created_at", ">=", new Date("2024-01-01"))

// LIKE
.where("email", "LIKE", "%@example.com")

// IN
.whereIn("role", ["admin", "moderator"])

// IS NULL
.whereNull("deleted_at")
.whereNotNull("email")
```

## 排序和分页

```typescript
const users = await db
  .from("users")
  .select(["id", "name", "created_at"])
  .where("active", "=", true)
  .orderBy("created_at", "DESC")
  .limit(20)
  .offset(40)  // 第 3 页
  .execute();
```

## JOIN 查询

```typescript
const posts = await db
  .from("posts")
  .select(["posts.id", "posts.title", "users.name as author_name"])
  .join("users", "posts.user_id", "=", "users.id")
  .leftJoin("categories", "posts.category_id", "=", "categories.id")
  .where("posts.published", "=", true)
  .execute();
```

## 聚合查询

```typescript
// 计数
const total = await db
  .from("users")
  .where("active", "=", true)
  .count();

// 分组
const countByRole = await db
  .from("users")
  .select(["role"])
  .count("* as total")
  .groupBy("role")
  .execute();
```

## INSERT

```typescript
// 插入单条记录
const user = await db
  .insert("users", {
    name: "Alice",
    email: "alice@example.com",
    role: "user",
  })
  .returning("*")
  .first();

// 批量插入
await db.insertMany("users", [
  { name: "Bob", email: "bob@example.com" },
  { name: "Carol", email: "carol@example.com" },
]);
```

## UPDATE

```typescript
// 更新
await db
  .update("users")
  .set({ name: "Alice Smith", updated_at: new Date() })
  .where("id", "=", userId)
  .execute();

// 返回更新后的记录
const updated = await db
  .update("users")
  .set({ active: false })
  .where("id", "=", userId)
  .returning("*")
  .first();
```

## DELETE

```typescript
await db
  .delete("users")
  .where("id", "=", userId)
  .execute();

// 软删除
await db
  .update("users")
  .set({ deleted_at: new Date() })
  .where("id", "=", userId)
  .execute();
```

## 原始 SQL

```typescript
// 需要原始 SQL 时
const result = await db.raw(
  "SELECT * FROM users WHERE age > $1 AND city = $2",
  [18, "Shanghai"]
);
```

## 查询单条记录

```typescript
// 返回第一条，无结果返回 null
const user = await db
  .from("users")
  .where("email", "=", "alice@example.com")
  .first();

if (!user) {
  throw new NotFoundError("用户不存在");
}
```

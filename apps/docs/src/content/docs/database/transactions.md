---
title: 事务管理
description: 使用 createTransactionManager 处理数据库事务
---

`createTransactionManager` 提供了简洁的事务 API，支持嵌套事务（保存点）和自动回滚。

## 基本用法

```typescript
import { createTransactionManager } from "@aeron/database";

const db = createQueryBuilder({ url: process.env.DATABASE_URL! });
const txm = createTransactionManager(db);

// 自动管理事务（成功时提交，失败时回滚）
await txm.run(async (tx) => {
  const user = await tx.insert("users", {
    name: "Alice",
    email: "alice@example.com",
  }).returning("*").first();

  await tx.insert("profiles", {
    user_id: user.id,
    bio: "Hello, I'm Alice",
  }).execute();

  // 函数正常返回 -> 自动提交
  // 抛出异常 -> 自动回滚
});
```

## 嵌套事务（保存点）

```typescript
await txm.run(async (tx) => {
  await tx.insert("orders", { user_id: 1, total: 100 }).execute();

  try {
    // 嵌套事务使用保存点
    await txm.run(async (innerTx) => {
      await innerTx.insert("order_items", { order_id: 1, product_id: 5 }).execute();
      // 如果这里失败，只回滚到保存点，不影响外层事务
    }, tx);
  } catch (err) {
    console.warn("添加订单项失败，但订单已保存");
  }
});
```

## 手动控制事务

```typescript
const tx = await txm.begin();
try {
  await tx.update("users").set({ balance: db.raw("balance - 100") }).where("id", "=", fromId).execute();
  await tx.update("users").set({ balance: db.raw("balance + 100") }).where("id", "=", toId).execute();
  await tx.commit();
} catch (err) {
  await tx.rollback();
  throw err;
}
```

## 事务隔离级别

```typescript
await txm.run(
  async (tx) => {
    // 可重复读事务
    const balance = await tx.from("accounts").where("id", "=", accountId).first();
    // ...
  },
  null,
  { isolationLevel: "REPEATABLE READ" }
);
```

## TransactionManager 接口

```typescript
interface TransactionManager {
  run<T>(
    fn: (tx: Transaction) => Promise<T>,
    parentTx?: Transaction | null,
    options?: { isolationLevel?: string }
  ): Promise<T>;
  begin(): Promise<Transaction>;
}

interface Transaction extends QueryBuilder {
  commit(): Promise<void>;
  rollback(): Promise<void>;
}
```

---
order: 3
title: 事务管理
description: 使用 createTransactionManager 处理数据库事务
---

`createTransactionManager` 提供了显式事务控制、隔离级别、只读模式与嵌套 Savepoint 能力。

## 基本用法

```typescript
import { createTransactionManager } from "@ventostack/database";

const txm = createTransactionManager(executor);

// 开始事务
await txm.begin();
try {
  await executor("INSERT INTO users (name) VALUES ('Alice')");
  await executor("INSERT INTO profiles (bio) VALUES ('Hello')");
  await txm.commit();
} catch (err) {
  await txm.rollback();
  throw err;
}
```

## 嵌套事务（Savepoint）

```typescript
await txm.begin();
await executor("INSERT INTO orders (total) VALUES (100)");

// 嵌套事务使用保存点
await txm.savepoint("sp1");
try {
  await executor("INSERT INTO order_items (product_id) VALUES (5)");
  await txm.releaseSavepoint("sp1");
} catch (err) {
  await txm.rollbackTo("sp1");
  console.warn("添加订单项失败，但订单已保存");
}

await txm.commit();
```

`savepoint()`、`releaseSavepoint()` 和 `rollbackTo()` 都会改变事务深度（`depth()`）。`savepoint()` 增加深度，`releaseSavepoint()` 和 `rollbackTo()` 减少深度。

`releaseSavepoint()` 只能释放最近创建的 savepoint（LIFO 顺序），尝试释放非最近的 savepoint 会抛出错误。

## 自动嵌套事务

```typescript
await txm.begin();
try {
  await executor("INSERT INTO orders (total) VALUES (100)");

  // nested 自动管理 savepoint
  await txm.nested(async (exec) => {
    await exec("INSERT INTO order_items (product_id) VALUES (5)");
  });

  await txm.commit();
} catch (err) {
  await txm.rollback();
  throw err;
}
```

## 事务隔离级别

```typescript
await txm.begin({ isolation: "repeatable_read", readOnly: false });
const rows = await executor("SELECT * FROM accounts WHERE id = $1", [accountId]);
// ...
await txm.commit();
```

支持的隔离级别：`read_uncommitted`、`read_committed`、`repeatable_read`、`serializable`。

## 事务状态查询

```typescript
await txm.begin();
console.log(txm.depth());      // 1 — 当前事务深度
console.log(txm.isActive());   // true — 是否在活跃事务中

await txm.savepoint("sp1");
console.log(txm.depth());      // 2

await txm.rollbackTo("sp1");
await txm.releaseSavepoint("sp1");
await txm.commit();
console.log(txm.depth());      // 0
console.log(txm.isActive());   // false
```

## TransactionManager 接口

```typescript
interface TransactionManager {
  begin(options?: TransactionOptions): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  savepoint(name: string): Promise<void>;
  rollbackTo(name: string): Promise<void>;
  releaseSavepoint(name: string): Promise<void>;
  nested<T>(fn: (executor: SqlExecutor) => Promise<T>): Promise<T>;
  depth(): number;
  isActive(): boolean;
}

interface TransactionOptions {
  isolation?: "read_uncommitted" | "read_committed" | "repeatable_read" | "serializable";
  readOnly?: boolean;
}
```

## 与 Database 事务的对比

`createDatabase` 返回的 `Database` 实例也提供了更简洁的 `transaction` 方法：

```typescript
await db.transaction(async (tx) => {
  const user = await tx.query(UserModel).insert({ email: "a@b.com", name: "A", role: "user" });
  await tx.query(PostModel).insert({ title: "Hello", userId: user!.id });
});
```

`db.transaction` 自动处理 BEGIN / COMMIT / ROLLBACK，嵌套事务自动使用 SAVEPOINT。`createTransactionManager` 则提供更细粒度的显式控制（隔离级别、savepoint 命名、深度查询等）。

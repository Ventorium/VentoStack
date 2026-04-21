---
title: 连接池
description: 使用 createConnectionPool 管理数据库连接
---

`createConnectionPool` 提供了高效的数据库连接池管理，支持连接复用、自动重试和健康检测。

## 基本用法

```typescript
import { createConnectionPool } from "@aeron/database";

const pool = createConnectionPool({
  url: process.env.DATABASE_URL!,
  min: 2,         // 最小连接数
  max: 10,        // 最大连接数
  idleTimeout: 30_000,    // 空闲连接超时（ms）
  acquireTimeout: 5_000,  // 获取连接超时（ms）
});

// 获取连接并执行查询
const conn = await pool.acquire();
try {
  const result = await conn.query("SELECT * FROM users WHERE id = $1", [userId]);
  return result.rows;
} finally {
  pool.release(conn);
}
```

## 使用事务

```typescript
await pool.withConnection(async (conn) => {
  await conn.query("BEGIN");
  try {
    await conn.query("INSERT INTO users (name) VALUES ($1)", ["Alice"]);
    await conn.query("INSERT INTO profiles (user_id) VALUES (lastval())");
    await conn.query("COMMIT");
  } catch (err) {
    await conn.query("ROLLBACK");
    throw err;
  }
});
```

## 连接池监控

```typescript
// 获取连接池状态
const stats = pool.stats();
console.log({
  total: stats.total,    // 总连接数
  idle: stats.idle,      // 空闲连接数
  active: stats.active,  // 活跃连接数
  waiting: stats.waiting // 等待连接的请求数
});
```

## 关闭连接池

```typescript
// 应用停止时关闭
app.onStop(async () => {
  await pool.close();
});
```

## ConnectionPool 接口

```typescript
interface ConnectionPoolOptions {
  url: string;
  min?: number;
  max?: number;
  idleTimeout?: number;
  acquireTimeout?: number;
}

interface ConnectionPool {
  acquire(): Promise<Connection>;
  release(conn: Connection): void;
  withConnection<T>(fn: (conn: Connection) => Promise<T>): Promise<T>;
  stats(): PoolStats;
  close(): Promise<void>;
}
```

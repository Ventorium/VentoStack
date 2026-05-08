---
order: 1
title: 连接池
description: 使用 createConnectionPool 管理数据库连接复用
---

`createConnectionPool` 提供了通用的连接复用、空闲回收、等待队列与统计能力。支持最大连接数、空闲超时、获取超时与连接最大存活时间配置。

## 基本用法

```typescript
import { createConnectionPool } from "@ventostack/database";

interface DbConn {
  query(text: string, params?: unknown[]): Promise<unknown[]>;
  end(): Promise<void>;
  ping(): Promise<boolean>;
}

const pool = createConnectionPool<DbConn>({
  /** 创建新连接 */
  create: async () => {
    // 返回你的数据库驱动连接对象
    // 例如：return new Client(process.env.DATABASE_URL)
    return { query: async () => [], end: async () => {}, ping: async () => true };
  },

  /** 销毁连接 */
  destroy: async (conn) => {
    await conn.end();
  },

  /** 校验连接（可选） */
  validate: async (conn) => {
    return await conn.ping();
  },
}, {
  min: 2,
  max: 10,
  idleTimeout: 30_000,
  acquireTimeout: 5_000,
  maxLifetime: 3_600_000,
});

// 获取连接并执行查询
const conn = await pool.acquire();
try {
  const rows = await conn.query("SELECT * FROM users WHERE id = $1", [userId]);
  console.log(rows);
} finally {
  pool.release(conn);
}
```

### `factory.create`

**必需**。每次需要新连接时被调用，应返回一个全新的数据库连接对象。

- 连接池在以下场景调用 `create`：
  - 当前活跃 + 空闲连接数未达到 `max`，且 `acquire()` 没有可用连接时
  - 从池中获取的空闲连接校验失败（`validate` 返回 `false`），需要替换时

- **注意**：`create` 返回的连接对象会被连接池内部包装，**不要自行缓存或共享**这个返回值。

### `factory.destroy`

**必需**。永久关闭一个连接。当连接超时、校验失败或 `drain()` 时被调用。

### `factory.validate`

**可选**。获取空闲连接时执行健康检查：

- 返回 `true`：连接有效，直接返回给调用方
- 返回 `false`：连接已失效，连接池会销毁它并重新获取（再次调用 `create`）

典型实现是执行一次轻量查询（如 `SELECT 1`）检测连接是否断开。

## 连接池监控

```typescript
// 获取连接池状态
const stats = pool.stats();
console.log({
  total: stats.total,      // 当前总连接数
  active: stats.active,    // 活跃连接数
  idle: stats.idle,        // 空闲连接数
  waiting: stats.waiting,  // 等待队列长度
  maxSize: stats.maxSize,  // 最大连接数限制
});

// 获取当前池大小
console.log(pool.size());
```

## 关闭连接池

```typescript
// 排空并关闭所有连接
await pool.drain();

// 在应用生命周期中关闭
app.lifecycle.onBeforeStop(async () => {
  await pool.drain();
});
```

## 接口定义

```typescript
/** 连接池配置选项 */
interface ConnectionPoolOptions {
  /** 最大连接数，默认 10 */
  max?: number;
  /** 最小空闲连接数，默认 2 */
  min?: number;
  /** 空闲连接超时（毫秒），默认 30000 */
  idleTimeout?: number;
  /** 获取连接超时（毫秒），默认 5000 */
  acquireTimeout?: number;
  /** 连接最大存活时间（毫秒），默认 3600000 */
  maxLifetime?: number;
}

/** 连接池统计信息 */
interface PoolStats {
  /** 当前总连接数 */
  total: number;
  /** 活跃连接数 */
  active: number;
  /** 空闲连接数 */
  idle: number;
  /** 等待队列长度 */
  waiting: number;
  /** 最大连接数限制 */
  maxSize: number;
}

/** 连接池接口 */
interface ConnectionPool<T> {
  /** 获取连接（可能等待） */
  acquire(): Promise<T>;

  /** 释放连接回池 */
  release(conn: T): void;

  /** 销毁连接（从池中移除） */
  destroy(conn: T): void;

  /** 获取当前统计信息 */
  stats(): PoolStats;

  /** 排空并关闭连接池 */
  drain(): Promise<void>;

  /** 当前连接池大小 */
  size(): number;
}
```

## 注意事项

- `createConnectionPool` 是一个**通用连接池**，不直接处理数据库 URL。你需要在 `factory.create` 中自行创建连接。
- `factory.validate` 是可选的。如果提供，获取空闲连接时会先校验，无效连接会被销毁并重新获取。
- `drain()` 会关闭连接池，清空等待队列，并销毁所有连接。关闭后 `acquire()` 会抛出错误。
- `destroy(conn)` 用于从池中移除并销毁单个连接（通常在连接异常时使用）。
- 连接池内部会定期清理过期的空闲连接，清理间隔为 `min(idleTimeout, 10000)`。

---

## SQL 连接工厂（推荐）

对于大多数应用场景，推荐使用 `createSqlExecutor` 直接创建 Bun SQL 连接，无需手动管理 `createConnectionPool`：

```typescript
import { createSqlExecutor, createDatabase } from "@ventostack/database";

// 创建带连接池的 executor
const { executor, close } = createSqlExecutor("postgres://user:pass@localhost/db", {
  max: 10,       // 最大连接数
  idle: 30000,   // 空闲超时（毫秒）
  timeout: 5000, // 连接超时（毫秒）
});

// 创建数据库实例
const db = createDatabase({ executor });

// 使用完毕后关闭
await close();
```

### 创建独立的迁移连接

迁移建议使用单连接（`max: 1`），避免并发事务冲突：

```typescript
const pool = createSqlExecutor(process.env.DATABASE_URL!, { max: 10 });
const migration = createSqlExecutor(process.env.DATABASE_URL!, { max: 1 });

// 迁移使用单连接
const runner = createMigrationRunner(migration.executor);
await runner.up();

// 业务使用连接池
const db = createDatabase({ executor: pool.executor });

// 优雅关闭
app.lifecycle.onBeforeStop(async () => {
  await pool.close();
  await migration.close();
});
```

### 直接使用 createDatabase

如果不需要自定义连接池参数，可以直接传 URL：

```typescript
import { createDatabase } from "@ventostack/database";

const db = createDatabase({ url: "postgres://user:pass@localhost/db" });
// 内部自动创建 Bun.sql 连接
// db.close() 会自动关闭底层连接
```

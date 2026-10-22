/**
 * 数据库连接管理
 *
 * 使用 @ventostack/database 的 createSqlExecutor 创建连接，
 * 生产查询使用连接池，迁移使用单连接。
 */

import { createDatabase, createSqlExecutor } from "@ventostack/database";
import type { Database, SqlExecutor, SqlTransactionRunner } from "@ventostack/database";
import { env } from "../config";

export interface DatabaseContext {
  db: Database;
  executor: SqlExecutor;
  transactionRunner: SqlTransactionRunner;
  /** 迁移专用单连接 executor */
  migrationExecutor: SqlExecutor;
  /** 关闭数据库连接 */
  close: () => Promise<void>;
}

/** 跨 `bun --hot` 热重载保留的连接（模块级变量会被重置，globalThis 不会） */
const dbRegistry = globalThis as typeof globalThis & {
  __ventostackDb?: DatabaseContext;
};

/**
 * 创建数据库连接
 * @param tracedExecutor - 可选的已包装 executor（如 tracing），传入后 Database 实例使用此 executor
 */
export function createDatabaseConnection(tracedExecutor?: SqlExecutor): DatabaseContext {
  // 开发期热重载守卫：`bun --hot` 会在**同一进程**里重复执行入口模块，
  // 而不支持 import.meta.hot.dispose（实测 Bun 1.3 里 import.meta.hot 为 undefined），
  // 旧连接池不会关、模块级变量又会重置 → 每改一次代码泄漏一整个连接池（默认 10 条），
  // 改十几次就把 Postgres 的 max_connections 耗尽（表现为启动失败 sorry, too many clients already）。
  // 用 globalThis 跨热重载复用同一份连接，进程真正退出时才关闭。
  const existing = dbRegistry.__ventostackDb;
  if (existing) return existing;

  // 生产连接池 — 并发处理请求
  const pool = createSqlExecutor(env.DATABASE_URL, { max: env.DB_POOL_SIZE });
  const db = createDatabase({
    executor: tracedExecutor ?? pool.executor,
    transactionRunner: pool.transactionRunner,
  });

  // 迁移 单连接 — 允许手动 BEGIN/COMMIT
  const migration = createSqlExecutor(env.DATABASE_URL, { max: 1 });

  let closed = false;
  const context: DatabaseContext = {
    db,
    executor: pool.executor,
    transactionRunner: pool.transactionRunner,
    migrationExecutor: migration.executor,
    // 幂等：热重载后新旧实例可能都会调 close()
    async close() {
      if (closed) return;
      closed = true;
      if (dbRegistry.__ventostackDb === context) dbRegistry.__ventostackDb = undefined;
      await pool.close();
      await migration.close();
    },
  };

  dbRegistry.__ventostackDb = context;
  return context;
}

/**
 * 数据库连接管理
 *
 * 使用 @ventostack/database 的 createSqlExecutor 创建连接，
 * 生产查询使用连接池，迁移使用单连接。
 */

import { createDatabase, createSqlExecutor } from "@ventostack/database";
import type { Database, SqlExecutor } from "@ventostack/database";
import { env } from "../config";

export interface DatabaseContext {
  db: Database;
  executor: SqlExecutor;
  /** 迁移专用单连接 executor */
  migrationExecutor: SqlExecutor;
  /** 关闭数据库连接 */
  close: () => Promise<void>;
}

/**
 * 创建数据库连接
 * @param tracedExecutor - 可选的已包装 executor（如 tracing），传入后 Database 实例使用此 executor
 */
export function createDatabaseConnection(tracedExecutor?: SqlExecutor): DatabaseContext {
  // 生产连接池 — 并发处理请求
  const pool = createSqlExecutor(env.DATABASE_URL, { max: env.DB_POOL_SIZE });
  const db = createDatabase({ executor: tracedExecutor ?? pool.executor });

  // 迁移 单连接 — 允许手动 BEGIN/COMMIT
  const migration = createSqlExecutor(env.DATABASE_URL, { max: 1 });

  return {
    db,
    executor: pool.executor,
    migrationExecutor: migration.executor,
    async close() {
      await pool.close();
      await migration.close();
    },
  };
}

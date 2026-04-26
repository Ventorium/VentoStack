/**
 * 数据库连接管理
 */

import { createDatabase, type Database, type SqlExecutor } from "@ventostack/database";
import { env } from "../config";

export interface DatabaseContext {
  /** Database 实例（ORM query builder 入口） */
  db: Database;
  /** 裸 SQL 执行器（系统服务层依赖此签名） */
  executor: SqlExecutor;
  /** 释放连接 */
  close: () => Promise<void>;
}

/**
 * 创建数据库连接
 */
export function createDatabaseConnection(): DatabaseContext {
  const db = createDatabase({ url: env.DATABASE_URL });

  const executor: SqlExecutor = (text: string, params?: unknown[]) =>
    db.raw(text, params);

  return {
    db,
    executor,
    async close() {
      // Database 不暴露 close，此处预留
    },
  };
}

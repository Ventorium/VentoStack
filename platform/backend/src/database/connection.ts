/**
 * 数据库连接管理
 *
 * 直接使用 Bun.SQL 创建连接（而非 @ventostack/database 的 createDatabase），
 * 传递 max: 1 以兼容迁移系统的 BEGIN/COMMIT 模式。
 * Bun 默认 block 不安全事务，max: 1 禁用此检查。
 */

import { createDatabase, type Database, type SqlExecutor } from "@ventostack/database";
import { env } from "../config";

export interface DatabaseContext {
  db: Database;
  executor: SqlExecutor;
  /** 关闭数据库连接 */
  close: () => Promise<void>;
}

function createBunExecutor(): { executor: SqlExecutor; close: () => Promise<void> } {
  // Bun 1.2+ 将 SQL 暴露为 globalThis.SQL
  const SQLClass =
    (globalThis as any).SQL ?? (globalThis as any).Bun?.SQL;

  if (typeof SQLClass !== "function") {
    throw new Error(
      "Bun.SQL is not available in this runtime. Please upgrade to Bun 1.2+.",
    );
  }

  // max: 1 — 允许 executor 发送 raw BEGIN/COMMIT（迁移系统依赖此模式）
  const sql = new SQLClass({ url: env.DATABASE_URL, max: 1 });

  const executor: SqlExecutor = async (text, params) => {
    const result = params && params.length > 0
      ? await sql.unsafe(text, params as any[])
      : await sql.unsafe(text);
    return Array.isArray(result) ? result : [];
  };

  return {
    executor,
    async close() {
      sql.close();
    },
  };
}

/**
 * 创建数据库连接
 */
export function createDatabaseConnection(): DatabaseContext {
  const { executor, close } = createBunExecutor();
  const db = createDatabase({ executor });

  return { db, executor, close };
}

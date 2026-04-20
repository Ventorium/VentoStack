// @aeron/database - 嵌套事务 / Savepoint 支持

import type { SqlExecutor } from "./database";

export interface TransactionOptions {
  /** 事务隔离级别 */
  isolation?: "read_uncommitted" | "read_committed" | "repeatable_read" | "serializable";
  /** 是否只读 */
  readOnly?: boolean;
}

export interface TransactionManager {
  /** 开始事务 */
  begin(options?: TransactionOptions): Promise<void>;
  /** 提交事务 */
  commit(): Promise<void>;
  /** 回滚事务 */
  rollback(): Promise<void>;
  /** 创建 Savepoint */
  savepoint(name: string): Promise<void>;
  /** 回滚到 Savepoint */
  rollbackTo(name: string): Promise<void>;
  /** 释放 Savepoint */
  releaseSavepoint(name: string): Promise<void>;
  /** 嵌套事务（自动使用 savepoint） */
  nested<T>(fn: (executor: SqlExecutor) => Promise<T>): Promise<T>;
  /** 获取当前事务深度 */
  depth(): number;
  /** 是否在事务中 */
  isActive(): boolean;
}

/**
 * 创建事务管理器，支持嵌套事务（通过 Savepoint 实现）
 */
export function createTransactionManager(executor: SqlExecutor): TransactionManager {
  let transactionDepth = 0;
  let active = false;
  const savepoints: string[] = [];

  return {
    async begin(options?: TransactionOptions): Promise<void> {
      if (transactionDepth === 0) {
        let sql = "BEGIN";
        if (options?.isolation) {
          const level = options.isolation.replace(/_/g, " ").toUpperCase();
          sql = `BEGIN ISOLATION LEVEL ${level}`;
        }
        if (options?.readOnly) {
          sql += " READ ONLY";
        }
        await executor(sql);
        active = true;
      } else {
        // 嵌套事务 → Savepoint
        const name = `sp_${transactionDepth}`;
        await executor(`SAVEPOINT ${name}`);
        savepoints.push(name);
      }
      transactionDepth++;
    },

    async commit(): Promise<void> {
      if (transactionDepth <= 0) throw new Error("No active transaction");
      transactionDepth--;
      if (transactionDepth === 0) {
        await executor("COMMIT");
        active = false;
        savepoints.length = 0;
      } else {
        const sp = savepoints.pop();
        if (sp) {
          await executor(`RELEASE SAVEPOINT ${sp}`);
        }
      }
    },

    async rollback(): Promise<void> {
      if (transactionDepth <= 0) throw new Error("No active transaction");
      transactionDepth--;
      if (transactionDepth === 0) {
        await executor("ROLLBACK");
        active = false;
        savepoints.length = 0;
      } else {
        const sp = savepoints.pop();
        if (sp) {
          await executor(`ROLLBACK TO SAVEPOINT ${sp}`);
        }
      }
    },

    async savepoint(name: string): Promise<void> {
      if (!active) throw new Error("No active transaction");
      await executor(`SAVEPOINT ${name}`);
      savepoints.push(name);
    },

    async rollbackTo(name: string): Promise<void> {
      if (!active) throw new Error("No active transaction");
      await executor(`ROLLBACK TO SAVEPOINT ${name}`);
    },

    async releaseSavepoint(name: string): Promise<void> {
      if (!active) throw new Error("No active transaction");
      await executor(`RELEASE SAVEPOINT ${name}`);
      const idx = savepoints.indexOf(name);
      if (idx !== -1) savepoints.splice(idx, 1);
    },

    async nested<T>(fn: (executor: SqlExecutor) => Promise<T>): Promise<T> {
      await this.begin();
      try {
        const result = await fn(executor);
        await this.commit();
        return result;
      } catch (err) {
        await this.rollback();
        throw err;
      }
    },

    depth(): number {
      return transactionDepth;
    },

    isActive(): boolean {
      return active;
    },
  };
}

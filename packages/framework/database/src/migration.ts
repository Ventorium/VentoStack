/**
 * @ventostack/database — 迁移管理器
 * 提供版本化数据库结构变更能力，支持 up / down / status 操作
 * 迁移记录持久化于 __migrations 表，保证幂等性与可追溯性
 */

import type { SqlExecutor } from "./database";

/**
 * 单个迁移定义。
 */
export interface Migration {
  /** 迁移名称（唯一标识，通常含时间戳前缀） */
  name: string;
  /**
   * 执行升级。
   * @param executor — SQL 执行器
   */
  up: (executor: SqlExecutor) => Promise<void>;
  /**
   * 执行回滚。
   * @param executor — SQL 执行器
   */
  down: (executor: SqlExecutor) => Promise<void>;
}

/**
 * 迁移状态记录。
 */
export interface MigrationStatus {
  /** 迁移名称 */
  name: string;
  /** 执行时间（未执行则为 null） */
  executedAt: Date | null;
}

/**
 * 迁移运行器接口。
 */
export interface MigrationRunner {
  /**
   * 注册迁移。
   * @param migration — 迁移定义
   */
  addMigration(migration: Migration): void;
  /**
   * 执行所有待执行的升级迁移。
   * @returns 本次实际执行的迁移名称列表
   */
  up(): Promise<string[]>;
  /**
   * 回滚最近 N 个已执行迁移。
   * @param steps — 回滚步数（默认 1）
   * @returns 本次实际回滚的迁移名称列表
   */
  down(steps?: number): Promise<string[]>;
  /**
   * 获取所有迁移的执行状态。
   * @returns 迁移状态数组
   */
  status(): Promise<MigrationStatus[]>;
}

/** 迁移记录表名 */
const MIGRATIONS_TABLE = "__migrations";

/** 创建迁移记录表的 SQL */
const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (name TEXT PRIMARY KEY, executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`;

/**
 * 确保迁移记录表已存在。
 * @param executor — SQL 执行器
 */
async function ensureMigrationsTable(executor: SqlExecutor): Promise<void> {
  await executor(CREATE_TABLE_SQL);
}

/**
 * 获取已执行的迁移列表。
 * @param executor — SQL 执行器
 * @returns 已执行迁移数组（含执行时间字符串）
 */
async function getExecutedMigrations(
  executor: SqlExecutor,
): Promise<Array<{ name: string; executed_at: string }>> {
  const rows = await executor(
    `SELECT name, executed_at FROM ${MIGRATIONS_TABLE} ORDER BY name ASC`,
  );
  return rows as Array<{ name: string; executed_at: string }>;
}

/**
 * 创建迁移运行器。
 * @param executor — SQL 执行器
 * @returns MigrationRunner 实例
 */
export function createMigrationRunner(executor: SqlExecutor): MigrationRunner {
  const migrations: Migration[] = [];

  return {
    addMigration(migration: Migration): void {
      if (migrations.some((m) => m.name === migration.name)) {
        throw new Error(`Duplicate migration name: ${migration.name}`);
      }
      migrations.push(migration);
    },

    async up(): Promise<string[]> {
      await ensureMigrationsTable(executor);
      const executed = await getExecutedMigrations(executor);
      const executedNames = new Set(executed.map((r) => r.name));

      // 按名称排序后执行未执行的迁移
      const sorted = [...migrations].sort((a, b) => a.name.localeCompare(b.name));
      const pending = sorted.filter((m) => !executedNames.has(m.name));

      if (pending.length === 0) return [];

      const executedList: string[] = [];
      await executor("BEGIN");
      try {
        for (const migration of pending) {
          await migration.up(executor);
          await executor(`INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES ($1)`, [migration.name]);
          executedList.push(migration.name);
        }
        await executor("COMMIT");
      } catch (err) {
        await executor("ROLLBACK");
        throw err;
      }

      return executedList;
    },

    async down(steps = 1): Promise<string[]> {
      if (steps <= 0) {
        throw new RangeError("steps must be a positive integer");
      }

      await ensureMigrationsTable(executor);
      const executed = await getExecutedMigrations(executor);

      // 取最近执行的 N 个迁移（按名称倒序）
      const toRollback = executed.sort((a, b) => b.name.localeCompare(a.name)).slice(0, steps);

      const rolledBack: string[] = [];
      for (const record of toRollback) {
        const migration = migrations.find((m) => m.name === record.name);
        if (!migration) {
          throw new Error(`Migration ${record.name} was executed but is no longer registered`);
        }

        await executor("BEGIN");
        try {
          await migration.down(executor);
          await executor(`DELETE FROM ${MIGRATIONS_TABLE} WHERE name = $1`, [migration.name]);
          await executor("COMMIT");
        } catch (err) {
          await executor("ROLLBACK");
          throw err;
        }
        rolledBack.push(migration.name);
      }

      return rolledBack;
    },

    async status(): Promise<MigrationStatus[]> {
      await ensureMigrationsTable(executor);
      const executed = await getExecutedMigrations(executor);
      const executedMap = new Map(executed.map((r) => [r.name, new Date(r.executed_at)]));

      const sorted = [...migrations].sort((a, b) => a.name.localeCompare(b.name));
      return sorted.map((m) => ({
        name: m.name,
        executedAt: executedMap.get(m.name) ?? null,
      }));
    },
  };
}

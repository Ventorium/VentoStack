// @aeron/database - Migration Runner

import type { SqlExecutor } from "./database";

export interface Migration {
  name: string;
  up: (executor: (text: string, params?: unknown[]) => Promise<unknown>) => Promise<void>;
  down: (executor: (text: string, params?: unknown[]) => Promise<unknown>) => Promise<void>;
}

export interface MigrationStatus {
  name: string;
  executedAt: Date | null;
}

export interface MigrationRunner {
  addMigration(migration: Migration): void;
  up(): Promise<string[]>;
  down(steps?: number): Promise<string[]>;
  status(): Promise<MigrationStatus[]>;
}

const MIGRATIONS_TABLE = "__migrations";

const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (name TEXT PRIMARY KEY, executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`;

async function ensureMigrationsTable(executor: SqlExecutor): Promise<void> {
  await executor(CREATE_TABLE_SQL);
}

async function getExecutedMigrations(executor: SqlExecutor): Promise<Array<{ name: string; executed_at: string }>> {
  const rows = await executor(
    `SELECT name, executed_at FROM ${MIGRATIONS_TABLE} ORDER BY name ASC`,
  );
  return rows as Array<{ name: string; executed_at: string }>;
}

export function createMigrationRunner(executor: SqlExecutor): MigrationRunner {
  const migrations: Migration[] = [];

  return {
    addMigration(migration: Migration): void {
      migrations.push(migration);
    },

    async up(): Promise<string[]> {
      await ensureMigrationsTable(executor);
      const executed = await getExecutedMigrations(executor);
      const executedNames = new Set(executed.map((r) => r.name));

      // Sort migrations by name
      const sorted = [...migrations].sort((a, b) => a.name.localeCompare(b.name));
      const pending = sorted.filter((m) => !executedNames.has(m.name));

      const executedList: string[] = [];
      for (const migration of pending) {
        const wrappedExecutor: SqlExecutor = async (text, params?) => {
          const result = await executor(text, params);
          return Array.isArray(result) ? result : [];
        };
        await migration.up(wrappedExecutor);
        await executor(
          `INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES ($1)`,
          [migration.name],
        );
        executedList.push(migration.name);
      }

      return executedList;
    },

    async down(steps = 1): Promise<string[]> {
      await ensureMigrationsTable(executor);
      const executed = await getExecutedMigrations(executor);

      // Get last N executed migrations (reverse order)
      const toRollback = executed
        .sort((a, b) => b.name.localeCompare(a.name))
        .slice(0, steps);

      const rolledBack: string[] = [];
      for (const record of toRollback) {
        const migration = migrations.find((m) => m.name === record.name);
        if (migration) {
          const wrappedExecutor: SqlExecutor = async (text, params?) => {
            const result = await executor(text, params);
            return Array.isArray(result) ? result : [];
          };
          await migration.down(wrappedExecutor);
          await executor(
            `DELETE FROM ${MIGRATIONS_TABLE} WHERE name = $1`,
            [migration.name],
          );
          rolledBack.push(migration.name);
        }
      }

      return rolledBack;
    },

    async status(): Promise<MigrationStatus[]> {
      await ensureMigrationsTable(executor);
      const executed = await getExecutedMigrations(executor);
      const executedMap = new Map(
        executed.map((r) => [r.name, new Date(r.executed_at)]),
      );

      const sorted = [...migrations].sort((a, b) => a.name.localeCompare(b.name));
      return sorted.map((m) => ({
        name: m.name,
        executedAt: executedMap.get(m.name) ?? null,
      }));
    },
  };
}

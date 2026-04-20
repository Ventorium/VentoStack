import { describe, expect, mock, test } from "bun:test";
import { createMigrationRunner } from "../migration";
import type { Migration } from "../migration";

function createMockExecutor() {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];
  // Track migration table state
  const migrationRecords: Array<{ name: string; executed_at: string }> = [];

  const executor = mock(async (text: string, params?: unknown[]): Promise<unknown[]> => {
    executedQueries.push({ text, params });

    // Handle CREATE TABLE
    if (text.startsWith("CREATE TABLE")) {
      return [];
    }

    // Handle SELECT from migrations table
    if (text.includes("SELECT name, executed_at FROM __migrations")) {
      return [...migrationRecords];
    }

    // Handle INSERT into migrations table
    if (text.includes("INSERT INTO __migrations")) {
      const name = (params as string[])[0];
      migrationRecords.push({
        name,
        executed_at: new Date().toISOString(),
      });
      return [];
    }

    // Handle DELETE from migrations table
    if (text.includes("DELETE FROM __migrations")) {
      const name = (params as string[])[0];
      const idx = migrationRecords.findIndex((r) => r.name === name);
      if (idx !== -1) {
        migrationRecords.splice(idx, 1);
      }
      return [];
    }

    // Default: return empty
    return [];
  });

  return { executor, executedQueries, migrationRecords };
}

function createTestMigration(name: string): Migration {
  return {
    name,
    up: mock(async (exec) => {
      await exec(`CREATE TABLE ${name}_table (id INT)`);
    }),
    down: mock(async (exec) => {
      await exec(`DROP TABLE ${name}_table`);
    }),
  };
}

describe("createMigrationRunner", () => {
  test("creates a runner", () => {
    const { executor } = createMockExecutor();
    const runner = createMigrationRunner(executor);
    expect(runner).toBeDefined();
    expect(runner.addMigration).toBeFunction();
    expect(runner.up).toBeFunction();
    expect(runner.down).toBeFunction();
    expect(runner.status).toBeFunction();
  });
});

describe("MigrationRunner.up", () => {
  test("runs all pending migrations", async () => {
    const { executor } = createMockExecutor();
    const runner = createMigrationRunner(executor);

    const m1 = createTestMigration("001_create_users");
    const m2 = createTestMigration("002_create_posts");
    runner.addMigration(m1);
    runner.addMigration(m2);

    const executed = await runner.up();

    expect(executed).toEqual(["001_create_users", "002_create_posts"]);
    expect(m1.up).toHaveBeenCalledTimes(1);
    expect(m2.up).toHaveBeenCalledTimes(1);
  });

  test("skips already executed migrations", async () => {
    const { executor, migrationRecords } = createMockExecutor();
    // Pre-populate executed migration
    migrationRecords.push({ name: "001_create_users", executed_at: new Date().toISOString() });

    const runner = createMigrationRunner(executor);
    const m1 = createTestMigration("001_create_users");
    const m2 = createTestMigration("002_create_posts");
    runner.addMigration(m1);
    runner.addMigration(m2);

    const executed = await runner.up();

    expect(executed).toEqual(["002_create_posts"]);
    expect(m1.up).not.toHaveBeenCalled();
    expect(m2.up).toHaveBeenCalledTimes(1);
  });

  test("runs migrations in name order", async () => {
    const { executor } = createMockExecutor();
    const runner = createMigrationRunner(executor);

    // Add in reverse order
    const m2 = createTestMigration("002_create_posts");
    const m1 = createTestMigration("001_create_users");
    runner.addMigration(m2);
    runner.addMigration(m1);

    const executed = await runner.up();

    expect(executed).toEqual(["001_create_users", "002_create_posts"]);
  });

  test("returns empty array when no pending migrations", async () => {
    const { executor, migrationRecords } = createMockExecutor();
    migrationRecords.push({ name: "001_create_users", executed_at: new Date().toISOString() });

    const runner = createMigrationRunner(executor);
    runner.addMigration(createTestMigration("001_create_users"));

    const executed = await runner.up();
    expect(executed).toEqual([]);
  });

  test("ensures migrations table exists", async () => {
    const { executor, executedQueries } = createMockExecutor();
    const runner = createMigrationRunner(executor);
    runner.addMigration(createTestMigration("001_test"));

    await runner.up();

    expect(executedQueries[0]!.text).toContain("CREATE TABLE IF NOT EXISTS __migrations");
  });
});

describe("MigrationRunner.down", () => {
  test("rolls back last migration by default", async () => {
    const { executor, migrationRecords } = createMockExecutor();
    migrationRecords.push({ name: "001_create_users", executed_at: "2024-01-01T00:00:00Z" });
    migrationRecords.push({ name: "002_create_posts", executed_at: "2024-01-02T00:00:00Z" });

    const runner = createMigrationRunner(executor);
    const m1 = createTestMigration("001_create_users");
    const m2 = createTestMigration("002_create_posts");
    runner.addMigration(m1);
    runner.addMigration(m2);

    const rolledBack = await runner.down();

    expect(rolledBack).toEqual(["002_create_posts"]);
    expect(m2.down).toHaveBeenCalledTimes(1);
    expect(m1.down).not.toHaveBeenCalled();
  });

  test("rolls back specified number of steps", async () => {
    const { executor, migrationRecords } = createMockExecutor();
    migrationRecords.push({ name: "001_create_users", executed_at: "2024-01-01T00:00:00Z" });
    migrationRecords.push({ name: "002_create_posts", executed_at: "2024-01-02T00:00:00Z" });

    const runner = createMigrationRunner(executor);
    const m1 = createTestMigration("001_create_users");
    const m2 = createTestMigration("002_create_posts");
    runner.addMigration(m1);
    runner.addMigration(m2);

    const rolledBack = await runner.down(2);

    expect(rolledBack).toEqual(["002_create_posts", "001_create_users"]);
    expect(m1.down).toHaveBeenCalledTimes(1);
    expect(m2.down).toHaveBeenCalledTimes(1);
  });

  test("returns empty when nothing to rollback", async () => {
    const { executor } = createMockExecutor();
    const runner = createMigrationRunner(executor);
    runner.addMigration(createTestMigration("001_test"));

    const rolledBack = await runner.down();
    expect(rolledBack).toEqual([]);
  });

  test("removes migration record after rollback", async () => {
    const { executor, migrationRecords } = createMockExecutor();
    migrationRecords.push({ name: "001_create_users", executed_at: "2024-01-01T00:00:00Z" });

    const runner = createMigrationRunner(executor);
    runner.addMigration(createTestMigration("001_create_users"));

    await runner.down();

    // Migration record should be removed
    expect(migrationRecords).toHaveLength(0);
  });
});

describe("MigrationRunner.status", () => {
  test("returns status for all migrations", async () => {
    const { executor, migrationRecords } = createMockExecutor();
    migrationRecords.push({ name: "001_create_users", executed_at: "2024-01-01T00:00:00Z" });

    const runner = createMigrationRunner(executor);
    runner.addMigration(createTestMigration("001_create_users"));
    runner.addMigration(createTestMigration("002_create_posts"));

    const statuses = await runner.status();

    expect(statuses).toHaveLength(2);
    expect(statuses[0]!.name).toBe("001_create_users");
    expect(statuses[0]!.executedAt).toBeInstanceOf(Date);
    expect(statuses[1]!.name).toBe("002_create_posts");
    expect(statuses[1]!.executedAt).toBeNull();
  });

  test("returns sorted by name", async () => {
    const { executor } = createMockExecutor();
    const runner = createMigrationRunner(executor);

    runner.addMigration(createTestMigration("003_third"));
    runner.addMigration(createTestMigration("001_first"));
    runner.addMigration(createTestMigration("002_second"));

    const statuses = await runner.status();

    expect(statuses[0]!.name).toBe("001_first");
    expect(statuses[1]!.name).toBe("002_second");
    expect(statuses[2]!.name).toBe("003_third");
  });

  test("all pending when none executed", async () => {
    const { executor } = createMockExecutor();
    const runner = createMigrationRunner(executor);
    runner.addMigration(createTestMigration("001_test"));

    const statuses = await runner.status();

    expect(statuses).toHaveLength(1);
    expect(statuses[0]!.executedAt).toBeNull();
  });
});

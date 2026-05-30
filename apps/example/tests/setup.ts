import { Database as SQLiteDB } from "bun:sqlite";
import { createDatabase, createMigrationRunner } from "@ventostack/database";
import type { Database, SqlExecutor } from "@ventostack/database";
import { migrations } from "../src/migrations";
import { createAuthService } from "../src/services/auth-service";
import { createUserService } from "../src/services/user-service";

export function createTestExecutor(): { sqlite: SQLiteDB; executor: SqlExecutor } {
  const sqlite = new SQLiteDB(":memory:");
  const executor: SqlExecutor = async (text, params) => {
    const stmt = sqlite.query(text);
    const result = params && params.length > 0 ? stmt.all(...(params as any[])) : stmt.all();
    return Array.isArray(result) ? result : [];
  };
  return { sqlite, executor };
}

export async function createTestDatabase(): Promise<{ db: Database; sqlite: SQLiteDB }> {
  const { sqlite, executor } = createTestExecutor();
  const db = createDatabase({ executor });

  const runner = createMigrationRunner(executor);
  for (const migration of migrations) {
    runner.addMigration(migration);
  }
  await runner.up();

  return { db, sqlite };
}

export function createTestUserService(db: Database) {
  return createUserService({ db });
}

export function createTestAuthService(
  userService: ReturnType<typeof createUserService>,
  jwtSecret = "test-secret-key-at-least-32-bytes-long!!",
  jwtExpiresIn = 3600,
) {
  return createAuthService({ userService, jwtSecret, jwtExpiresIn });
}

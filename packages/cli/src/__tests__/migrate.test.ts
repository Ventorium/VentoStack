// @aeron/cli - Migrate Command Tests
import { describe, test, expect, spyOn, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMigrateCommand } from "../commands/migrate";
import type { MigrationRunner, MigrationStatus } from "@aeron/database";

function createMockRunner(overrides?: Partial<MigrationRunner>): MigrationRunner {
  return {
    addMigration: () => {},
    up: async () => [],
    down: async () => [],
    status: async () => [],
    ...overrides,
  };
}

describe("createMigrateCommand", () => {
  let logSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    logSpy = spyOn(console, "log").mockImplementation(() => {});
    errorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test("shows usage when no subcommand", async () => {
    const cmd = createMigrateCommand();
    await cmd.action({});

    expect(errorSpy).toHaveBeenCalledWith("Usage: aeron migrate <up|down|status|generate> [options]");
  });

  test("shows error for unknown subcommand", async () => {
    const cmd = createMigrateCommand();
    await cmd.action({ _: ["invalid"] });

    expect(errorSpy).toHaveBeenCalledWith("Unknown subcommand: invalid");
  });

  test("command has correct name and description", () => {
    const cmd = createMigrateCommand();
    expect(cmd.name).toBe("migrate");
    expect(cmd.description).toContain("migration");
  });

  // migrate up
  describe("up", () => {
    test("shows error without runner", async () => {
      const cmd = createMigrateCommand();
      await cmd.action({ _: ["up"] });

      expect(errorSpy).toHaveBeenCalledWith("No migration runner configured");
    });

    test("shows no pending when none to run", async () => {
      const runner = createMockRunner({ up: async () => [] });
      const cmd = createMigrateCommand({ runner });
      await cmd.action({ _: ["up"] });

      expect(logSpy).toHaveBeenCalledWith("No pending migrations");
    });

    test("executes pending migrations", async () => {
      const runner = createMockRunner({
        up: async () => ["001_create_users", "002_create_posts"],
      });
      const cmd = createMigrateCommand({ runner });
      await cmd.action({ _: ["up"] });

      expect(logSpy).toHaveBeenCalledWith("Migrated: 001_create_users");
      expect(logSpy).toHaveBeenCalledWith("Migrated: 002_create_posts");
      expect(logSpy).toHaveBeenCalledWith("Executed 2 migration(s)");
    });
  });

  // migrate down
  describe("down", () => {
    test("shows error without runner", async () => {
      const cmd = createMigrateCommand();
      await cmd.action({ _: ["down"] });

      expect(errorSpy).toHaveBeenCalledWith("No migration runner configured");
    });

    test("shows no migrations to roll back", async () => {
      const runner = createMockRunner({ down: async () => [] });
      const cmd = createMigrateCommand({ runner });
      await cmd.action({ _: ["down"] });

      expect(logSpy).toHaveBeenCalledWith("No migrations to roll back");
    });

    test("rolls back migrations", async () => {
      const runner = createMockRunner({
        down: async () => ["002_create_posts"],
      });
      const cmd = createMigrateCommand({ runner });
      await cmd.action({ _: ["down"] });

      expect(logSpy).toHaveBeenCalledWith("Rolled back: 002_create_posts");
      expect(logSpy).toHaveBeenCalledWith("Rolled back 1 migration(s)");
    });

    test("passes steps option to runner", async () => {
      let receivedSteps: number | undefined;
      const runner = createMockRunner({
        down: async (steps) => {
          receivedSteps = steps;
          return [];
        },
      });
      const cmd = createMigrateCommand({ runner });
      await cmd.action({ _: ["down"], steps: "3" });

      expect(receivedSteps).toBe(3);
    });

    test("defaults steps to 1", async () => {
      let receivedSteps: number | undefined;
      const runner = createMockRunner({
        down: async (steps) => {
          receivedSteps = steps;
          return [];
        },
      });
      const cmd = createMigrateCommand({ runner });
      await cmd.action({ _: ["down"] });

      expect(receivedSteps).toBe(1);
    });
  });

  // migrate status
  describe("status", () => {
    test("shows error without runner", async () => {
      const cmd = createMigrateCommand();
      await cmd.action({ _: ["status"] });

      expect(errorSpy).toHaveBeenCalledWith("No migration runner configured");
    });

    test("shows no migrations found", async () => {
      const runner = createMockRunner({ status: async () => [] });
      const cmd = createMigrateCommand({ runner });
      await cmd.action({ _: ["status"] });

      expect(logSpy).toHaveBeenCalledWith("No migrations found");
    });

    test("shows migration statuses", async () => {
      const date = new Date("2026-01-15T10:00:00Z");
      const statuses: MigrationStatus[] = [
        { name: "001_create_users", executedAt: date },
        { name: "002_create_posts", executedAt: null },
      ];
      const runner = createMockRunner({ status: async () => statuses });
      const cmd = createMigrateCommand({ runner });
      await cmd.action({ _: ["status"] });

      expect(logSpy).toHaveBeenCalledWith(`001_create_users: executed at ${date.toISOString()}`);
      expect(logSpy).toHaveBeenCalledWith("002_create_posts: pending");
    });
  });

  // migrate generate
  describe("generate", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), "aeron-migrate-test-"));
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    test("shows usage without name", async () => {
      const cmd = createMigrateCommand({ outputDir: tempDir });
      await cmd.action({ _: ["generate"] });

      expect(errorSpy).toHaveBeenCalledWith("Usage: aeron migrate generate <name>");
    });

    test("generates migration file", async () => {
      const cmd = createMigrateCommand({
        outputDir: tempDir,
        timestampFn: () => "20260420120000",
      });
      await cmd.action({ _: ["generate", "add_email_to_users"] });

      const filePath = join(tempDir, "20260420120000_add_email_to_users.ts");
      const content = await Bun.file(filePath).text();

      expect(content).toContain("Migration: add_email_to_users");
      expect(content).toContain("async up(executor)");
      expect(content).toContain("async down(executor)");
      expect(logSpy).toHaveBeenCalledWith(`Generated migration: ${filePath}`);
    });

    test("generates migration with real timestamp when no timestampFn", async () => {
      const cmd = createMigrateCommand({ outputDir: tempDir });
      await cmd.action({ _: ["generate", "test_ts"] });

      const output = logSpy.mock.calls[0]![0] as string;
      expect(output).toContain("Generated migration:");
      const match = output.match(/(\d{14})_test_ts/);
      expect(match).not.toBeNull();
    });
  });
});

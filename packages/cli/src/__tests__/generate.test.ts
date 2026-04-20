// @aeron/cli - Generate Command Tests
import { describe, test, expect, spyOn, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGenerateCommand } from "../commands/generate";

describe("createGenerateCommand", () => {
  let tempDir: string;
  let logSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "aeron-test-"));
    logSpy = spyOn(console, "log").mockImplementation(() => {});
    errorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("shows usage when no type provided", async () => {
    const cmd = createGenerateCommand({ outputDir: tempDir });
    await cmd.action({});

    expect(errorSpy).toHaveBeenCalledWith("Usage: aeron generate <type> <name>");
  });

  test("shows usage when no name provided", async () => {
    const cmd = createGenerateCommand({ outputDir: tempDir });
    await cmd.action({ _: ["controller"] });

    expect(errorSpy).toHaveBeenCalledWith("Usage: aeron generate <type> <name>");
  });

  test("shows error for unknown type", async () => {
    const cmd = createGenerateCommand({ outputDir: tempDir });
    await cmd.action({ _: ["unknown", "Foo"] });

    expect(errorSpy).toHaveBeenCalledWith("Unknown type: unknown");
  });

  test("generates controller file", async () => {
    const cmd = createGenerateCommand({ outputDir: tempDir });
    await cmd.action({ _: ["controller", "User"] });

    const filePath = join(tempDir, "user.controller.ts");
    const content = await Bun.file(filePath).text();

    expect(content).toContain("User Controller");
    expect(content).toContain("createUserController");
    expect(content).toContain("async index(ctx: Context)");
    expect(content).toContain("async show(ctx: Context)");
    expect(content).toContain("async create(ctx: Context)");
    expect(content).toContain("async update(ctx: Context)");
    expect(content).toContain("async delete(ctx: Context)");
    expect(logSpy).toHaveBeenCalledWith(`Generated controller: ${filePath}`);
  });

  test("generates model file", async () => {
    const cmd = createGenerateCommand({ outputDir: tempDir });
    await cmd.action({ _: ["model", "Post"] });

    const filePath = join(tempDir, "post.model.ts");
    const content = await Bun.file(filePath).text();

    expect(content).toContain("Post Model");
    expect(content).toContain("PostModel");
    expect(content).toContain('defineModel("posts"');
    expect(content).toContain("column.bigint");
    expect(content).toContain("column.varchar");
    expect(logSpy).toHaveBeenCalledWith(`Generated model: ${filePath}`);
  });

  test("generates migration file with timestamp", async () => {
    const cmd = createGenerateCommand({
      outputDir: tempDir,
      timestampFn: () => "20260420120000",
    });
    await cmd.action({ _: ["migration", "create_users"] });

    const filePath = join(tempDir, "20260420120000_create_users.ts");
    const content = await Bun.file(filePath).text();

    expect(content).toContain("Migration: create_users");
    expect(content).toContain('"20260420120000_create_users"');
    expect(content).toContain("async up(executor)");
    expect(content).toContain("async down(executor)");
    expect(logSpy).toHaveBeenCalledWith(`Generated migration: ${filePath}`);
  });

  test("command has correct name and description", () => {
    const cmd = createGenerateCommand();
    expect(cmd.name).toBe("generate");
    expect(cmd.description).toContain("Generate");
  });

  test("generates migration with real timestamp when no timestampFn", async () => {
    const cmd = createGenerateCommand({ outputDir: tempDir });
    await cmd.action({ _: ["migration", "test_real_ts"] });

    const output = logSpy.mock.calls[0]![0] as string;
    expect(output).toContain("Generated migration:");
    expect(output).toContain("_test_real_ts.ts");
    // Timestamp should be 14 digits
    const match = output.match(/(\d{14})_test_real_ts/);
    expect(match).not.toBeNull();
  });
});

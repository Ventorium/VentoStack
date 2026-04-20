import { describe, test, expect } from "bun:test";
import { createScaffoldCommand, scaffold } from "../commands/scaffold";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const TEST_DIR = join(import.meta.dir, "__test_scaffold_output__");

describe("scaffold", () => {
  // Clean up after tests
  function cleanup() {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  }

  test("creates project files", async () => {
    cleanup();
    try {
      const files = await scaffold({
        name: "test-app",
        directory: TEST_DIR,
      });
      expect(files.length).toBeGreaterThan(0);
      expect(existsSync(join(TEST_DIR, "package.json"))).toBe(true);
      expect(existsSync(join(TEST_DIR, "tsconfig.json"))).toBe(true);
      expect(existsSync(join(TEST_DIR, "src/index.ts"))).toBe(true);
      expect(existsSync(join(TEST_DIR, ".gitignore"))).toBe(true);
      expect(existsSync(join(TEST_DIR, "Dockerfile"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  test("package.json has correct name", async () => {
    cleanup();
    try {
      await scaffold({ name: "my-app", directory: TEST_DIR });
      const pkg = await Bun.file(join(TEST_DIR, "package.json")).json();
      expect(pkg.name).toBe("my-app");
    } finally {
      cleanup();
    }
  });

  test("tsconfig has strict mode", async () => {
    cleanup();
    try {
      await scaffold({ name: "my-app", directory: TEST_DIR });
      const tsconfig = await Bun.file(join(TEST_DIR, "tsconfig.json")).json();
      expect(tsconfig.compilerOptions.strict).toBe(true);
    } finally {
      cleanup();
    }
  });
});

describe("createScaffoldCommand", () => {
  test("returns valid command", () => {
    const cmd = createScaffoldCommand();
    expect(cmd.name).toBe("create");
    expect(cmd.description).toBeDefined();
    expect(cmd.options).toBeDefined();
    expect(typeof cmd.action).toBe("function");
  });
});

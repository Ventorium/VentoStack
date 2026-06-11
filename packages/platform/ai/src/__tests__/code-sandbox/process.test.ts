import { describe, test, expect, afterAll } from "bun:test";
import { createProcessSandbox } from "../../code-sandbox/process";

describe("createProcessSandbox", () => {
  let sandbox: ReturnType<typeof createProcessSandbox>;

  afterAll(async () => {
    if (sandbox) await sandbox.destroy();
  });

  test("creates sandbox with default config", () => {
    sandbox = createProcessSandbox({ timeout: 10000 });
    expect(sandbox).toBeDefined();
    expect(typeof sandbox.execute).toBe("function");
    expect(typeof sandbox.destroy).toBe("function");
  });

  test("executes simple code successfully", async () => {
    sandbox = createProcessSandbox({ timeout: 15000 });
    const result = await sandbox.execute('console.log("hello world");');
    expect(result.status).toBe("completed");
    expect(result.stdout).toContain("hello world");
    expect(result.exitCode).toBe(0);
    expect(result.duration).toBeGreaterThan(0);
  });

  test("handles code with errors", async () => {
    sandbox = createProcessSandbox({ timeout: 10000 });
    const result = await sandbox.execute('throw new Error("test error");');
    expect(result.status).toBe("error");
    expect(result.exitCode).not.toBe(0);
  });

  test("handles timeout", async () => {
    const shortSandbox = createProcessSandbox({ timeout: 500 });
    const result = await shortSandbox.execute("await Bun.sleep(5000);");
    expect(["timeout", "error"]).toContain(result.status);
    await shortSandbox.destroy();
  });

  test("destroy cleans up resources", async () => {
    const tempSandbox = createProcessSandbox();
    await tempSandbox.destroy();
    // Should not throw
  });
});

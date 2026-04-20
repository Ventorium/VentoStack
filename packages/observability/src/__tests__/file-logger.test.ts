import { describe, test, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileLogger } from "../file-logger";

const tmpDir = mkdtempSync(join(tmpdir(), "aeron-test-"));
afterAll(() => rmSync(tmpDir, { recursive: true }));

describe("createFileLogger", () => {
  test("writes log entries to file", () => {
    const filePath = join(tmpDir, "basic.log");
    const logger = createFileLogger({ filePath, level: "debug" });

    logger.info("hello world");

    const content = readFileSync(filePath, "utf-8");
    const entry = JSON.parse(content.trim());
    expect(entry.level).toBe("info");
    expect(entry.message).toBe("hello world");
    logger.close();
  });

  test("appends multiple entries", () => {
    const filePath = join(tmpDir, "multi.log");
    const logger = createFileLogger({ filePath, level: "debug" });

    logger.info("line1");
    logger.warn("line2");
    logger.error("line3");

    const lines = readFileSync(filePath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0]!).message).toBe("line1");
    expect(JSON.parse(lines[1]!).message).toBe("line2");
    expect(JSON.parse(lines[2]!).message).toBe("line3");
    logger.close();
  });

  test("manual rotate moves current file to .1", async () => {
    const filePath = join(tmpDir, "rotate.log");
    const logger = createFileLogger({ filePath, level: "debug" });

    logger.info("before rotate");
    await logger.rotate();
    logger.info("after rotate");

    const rotatedPath = join(tmpDir, "rotate.1.log");
    expect(existsSync(rotatedPath)).toBe(true);

    const rotatedContent = readFileSync(rotatedPath, "utf-8");
    expect(rotatedContent).toContain("before rotate");

    const currentContent = readFileSync(filePath, "utf-8");
    expect(currentContent).toContain("after rotate");
    logger.close();
  });

  test("auto-rotates when maxSize is exceeded", () => {
    const filePath = join(tmpDir, "auto-rotate.log");
    const logger = createFileLogger({ filePath, maxSize: 100, level: "debug" });

    // Write enough data to exceed 100 bytes
    logger.info("this is a long enough message to fill up the log file quickly");
    logger.info("second message should trigger rotation");

    const rotatedPath = join(tmpDir, "auto-rotate.1.log");
    expect(existsSync(rotatedPath)).toBe(true);
    logger.close();
  });

  test("maxFiles limits the number of rotated files", async () => {
    const filePath = join(tmpDir, "maxfiles.log");
    const logger = createFileLogger({ filePath, maxSize: 50, maxFiles: 2, level: "debug" });

    // Write enough to trigger multiple rotations
    for (let i = 0; i < 5; i++) {
      logger.info(`message number ${i} with some padding to exceed fifty bytes`);
    }

    // Should have at most .1 and .2 (maxFiles=2)
    const path1 = join(tmpDir, "maxfiles.1.log");
    const path2 = join(tmpDir, "maxfiles.2.log");
    const path3 = join(tmpDir, "maxfiles.3.log");

    expect(existsSync(path1)).toBe(true);
    expect(existsSync(path2)).toBe(true);
    expect(existsSync(path3)).toBe(false);
    logger.close();
  });

  test("close prevents further writes", () => {
    const filePath = join(tmpDir, "close.log");
    const logger = createFileLogger({ filePath, level: "debug" });

    logger.info("before close");
    logger.close();
    logger.info("after close");

    const content = readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!).message).toBe("before close");
  });

  test("redacts sensitive fields", () => {
    const filePath = join(tmpDir, "redact.log");
    const logger = createFileLogger({
      filePath,
      level: "debug",
      sensitiveFields: ["password", "token"],
    });

    logger.info("user login", { username: "alice", password: "secret123", token: "abc" });

    const content = readFileSync(filePath, "utf-8");
    const entry = JSON.parse(content.trim());
    expect(entry.password).toBe("***");
    expect(entry.token).toBe("***");
    expect(entry.username).toBe("alice");
    logger.close();
  });

  test("respects log level", () => {
    const filePath = join(tmpDir, "level.log");
    const logger = createFileLogger({ filePath, level: "warn" });

    logger.debug("debug msg");
    logger.info("info msg");
    logger.warn("warn msg");
    logger.error("error msg");

    const content = readFileSync(filePath, "utf-8").trim();
    const lines = content.split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).level).toBe("warn");
    expect(JSON.parse(lines[1]!).level).toBe("error");
    logger.close();
  });

  test("child logger writes to same file", () => {
    const filePath = join(tmpDir, "child.log");
    const logger = createFileLogger({ filePath, level: "debug" });
    const child = logger.child({ service: "auth" });

    child.info("child message");

    const content = readFileSync(filePath, "utf-8");
    const entry = JSON.parse(content.trim());
    expect(entry.message).toBe("child message");
    expect(entry.service).toBe("auth");
    logger.close();
  });
});

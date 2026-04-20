import { describe, test, expect, mock } from "bun:test";
import { createLogger } from "../logger";
import type { LogEntry } from "../logger";

describe("createLogger", () => {
  test("default logger outputs JSON to console", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({ output: (e) => entries.push(e) });

    logger.info("hello");

    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe("info");
    expect(entries[0].message).toBe("hello");
    expect(entries[0].timestamp).toBeTruthy();
  });

  test("respects log level filtering", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({ level: "warn", output: (e) => entries.push(e) });

    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    logger.fatal("f");

    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.level)).toEqual(["warn", "error", "fatal"]);
  });

  test("debug level allows all messages", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({ level: "debug", output: (e) => entries.push(e) });

    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    logger.fatal("f");

    expect(entries).toHaveLength(5);
  });

  test("fatal level only allows fatal", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({ level: "fatal", output: (e) => entries.push(e) });

    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    logger.fatal("f");

    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe("fatal");
  });

  test("includes meta in log entry", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({ output: (e) => entries.push(e) });

    logger.info("req", { requestId: "abc", method: "GET" });

    expect(entries[0].requestId).toBe("abc");
    expect(entries[0].method).toBe("GET");
  });

  test("child logger merges default meta", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({ output: (e) => entries.push(e) });
    const child = logger.child({ service: "auth" });

    child.info("login", { userId: "123" });

    expect(entries[0].service).toBe("auth");
    expect(entries[0].userId).toBe("123");
  });

  test("child logger meta can be overridden", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({ output: (e) => entries.push(e) });
    const child = logger.child({ env: "dev" });

    child.info("test", { env: "prod" });

    expect(entries[0].env).toBe("prod");
  });

  test("nested child loggers accumulate meta", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({ output: (e) => entries.push(e) });
    const child1 = logger.child({ a: 1 });
    const child2 = child1.child({ b: 2 });

    child2.info("nested");

    expect(entries[0].a).toBe(1);
    expect(entries[0].b).toBe(2);
  });
});

describe("sensitive field redaction", () => {
  test("redacts default sensitive fields", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({ output: (e) => entries.push(e) });

    logger.info("login", {
      username: "admin",
      password: "secret123",
      token: "abc",
      authorization: "Bearer xyz",
    });

    expect(entries[0].username).toBe("admin");
    expect(entries[0].password).toBe("***");
    expect(entries[0].token).toBe("***");
    expect(entries[0].authorization).toBe("***");
  });

  test("redacts custom sensitive fields", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({
      output: (e) => entries.push(e),
      sensitiveFields: ["ssn", "creditCard"],
    });

    logger.info("data", { ssn: "123-45-6789", creditCard: "4111", name: "John" });

    expect(entries[0].ssn).toBe("***");
    expect(entries[0].creditCard).toBe("***");
    expect(entries[0].name).toBe("John");
  });

  test("redacts nested objects recursively", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({ output: (e) => entries.push(e) });

    logger.info("nested", {
      user: {
        name: "alice",
        password: "secret",
        profile: {
          token: "xyz",
          bio: "hello",
        },
      },
    });

    const user = entries[0].user as Record<string, unknown>;
    expect(user.name).toBe("alice");
    expect(user.password).toBe("***");

    const profile = user.profile as Record<string, unknown>;
    expect(profile.token).toBe("***");
    expect(profile.bio).toBe("hello");
  });

  test("redacts fields in arrays", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({ output: (e) => entries.push(e) });

    logger.info("arr", {
      items: [
        { id: 1, secret: "a" },
        { id: 2, secret: "b" },
      ],
    });

    const items = entries[0].items as Array<Record<string, unknown>>;
    expect(items[0].id).toBe(1);
    expect(items[0].secret).toBe("***");
    expect(items[1].secret).toBe("***");
  });

  test("case-insensitive field matching", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({ output: (e) => entries.push(e) });

    logger.info("case", { Password: "x", TOKEN: "y", Cookie: "z" });

    expect(entries[0].Password).toBe("***");
    expect(entries[0].TOKEN).toBe("***");
    expect(entries[0].Cookie).toBe("***");
  });

  test("handles null and undefined values in meta", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({ output: (e) => entries.push(e) });

    logger.info("nulls", { a: null, b: undefined, c: "ok" });

    expect(entries[0].a).toBeNull();
    expect(entries[0].b).toBeUndefined();
    expect(entries[0].c).toBe("ok");
  });
});

describe("disabled logger", () => {
  test("all methods are no-op when disabled", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({ enabled: false, output: (e) => entries.push(e) });

    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    logger.fatal("f");

    expect(entries).toHaveLength(0);
  });

  test("child of disabled logger is also no-op", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({ enabled: false, output: (e) => entries.push(e) });
    const child = logger.child({ service: "test" });

    child.info("should not appear");

    expect(entries).toHaveLength(0);
  });

  test("child of disabled logger returns no-op child", () => {
    const logger = createLogger({ enabled: false });
    const child = logger.child({ a: 1 });
    const grandchild = child.child({ b: 2 });

    // Should not throw
    grandchild.info("test");
  });
});

describe("logger without options", () => {
  test("creates logger with default options", () => {
    const consoleSpy = mock(() => {});
    const origLog = console.log;
    console.log = consoleSpy;

    try {
      const logger = createLogger();
      logger.info("default test");

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const arg = consoleSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(arg);
      expect(parsed.level).toBe("info");
      expect(parsed.message).toBe("default test");
    } finally {
      console.log = origLog;
    }
  });
});

describe("logger without meta", () => {
  test("works without meta argument", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({ output: (e) => entries.push(e) });

    logger.info("no meta");

    expect(entries[0].message).toBe("no meta");
    // Only standard fields
    expect(Object.keys(entries[0])).toEqual(["timestamp", "level", "message"]);
  });
});

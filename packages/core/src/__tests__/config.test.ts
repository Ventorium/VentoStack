import { describe, test, expect } from "bun:test";
import { createConfig } from "../config";
import type { ConfigSchema } from "../config";

describe("createConfig", () => {
  test("reads default values", () => {
    const schema = {
      port: { type: "number" as const, default: 3000 },
      host: { type: "string" as const, default: "localhost" },
    };
    const config = createConfig(schema, {});

    expect(config["port"]).toBe(3000);
    expect(config["host"]).toBe("localhost");
  });

  test("reads from environment variables", () => {
    const schema = {
      port: { type: "number" as const, env: "APP_PORT", default: 3000 },
    };
    const config = createConfig(schema, { APP_PORT: "8080" });
    expect(config["port"]).toBe(8080);
  });

  test("env overrides default", () => {
    const schema = {
      debug: { type: "boolean" as const, env: "DEBUG", default: false },
    };
    const config = createConfig(schema, { DEBUG: "true" });
    expect(config["debug"]).toBe(true);
  });

  test("boolean coercion: true/1/false/0", () => {
    const schema = {
      a: { type: "boolean" as const, env: "A" },
      b: { type: "boolean" as const, env: "B" },
      c: { type: "boolean" as const, env: "C" },
      d: { type: "boolean" as const, env: "D" },
    };
    const config = createConfig(schema, {
      A: "true",
      B: "1",
      C: "false",
      D: "0",
    });
    expect(config["a"]).toBe(true);
    expect(config["b"]).toBe(true);
    expect(config["c"]).toBe(false);
    expect(config["d"]).toBe(false);
  });

  test("invalid boolean coercion throws", () => {
    const schema = {
      flag: { type: "boolean" as const, env: "FLAG" },
    };
    expect(() => createConfig(schema, { FLAG: "maybe" })).toThrow(
      'cannot coerce "maybe" to boolean',
    );
  });

  test("invalid number coercion throws", () => {
    const schema = {
      port: { type: "number" as const, env: "PORT" },
    };
    expect(() => createConfig(schema, { PORT: "abc" })).toThrow(
      'cannot coerce "abc" to number',
    );
  });

  test("required field throws when missing", () => {
    const schema = {
      secret: { type: "string" as const, required: true },
    };
    expect(() => createConfig(schema, {})).toThrow(
      '"secret" is required but not provided',
    );
  });

  test("required field satisfied by env", () => {
    const schema = {
      secret: { type: "string" as const, required: true, env: "SECRET" },
    };
    const config = createConfig(schema, { SECRET: "s3cret" });
    expect(config["secret"]).toBe("s3cret");
  });

  test("required field satisfied by default", () => {
    const schema = {
      mode: {
        type: "string" as const,
        required: true,
        default: "production",
      },
    };
    const config = createConfig(schema, {});
    expect(config["mode"]).toBe("production");
  });

  test("optional field returns undefined when absent", () => {
    const schema = {
      optional: { type: "string" as const },
    };
    const config = createConfig(schema, {});
    expect(config["optional"]).toBeUndefined();
  });

  test("nested schema", () => {
    const schema: ConfigSchema = {
      db: {
        host: { type: "string", default: "localhost" },
        port: { type: "number", default: 5432 },
      },
    };
    const config = createConfig(schema, {});
    const db = config["db"] as Record<string, unknown>;
    expect(db["host"]).toBe("localhost");
    expect(db["port"]).toBe(5432);
  });

  test("nested schema reads env", () => {
    const schema: ConfigSchema = {
      db: {
        host: { type: "string", env: "DB_HOST", default: "localhost" },
        port: { type: "number", env: "DB_PORT", default: 5432 },
      },
    };
    const config = createConfig(schema, {
      DB_HOST: "prod-db",
      DB_PORT: "5433",
    });
    const db = config["db"] as Record<string, unknown>;
    expect(db["host"]).toBe("prod-db");
    expect(db["port"]).toBe(5433);
  });

  test("deeply nested schema", () => {
    const schema: ConfigSchema = {
      level1: {
        level2: {
          value: { type: "string", default: "deep" },
        },
      },
    };
    const config = createConfig(schema, {});
    const l1 = config["level1"] as Record<string, unknown>;
    const l2 = l1["level2"] as Record<string, unknown>;
    expect(l2["value"]).toBe("deep");
  });

  test("required nested field throws with full path", () => {
    const schema: ConfigSchema = {
      db: {
        password: { type: "string", required: true },
      },
    };
    expect(() => createConfig(schema, {})).toThrow(
      '"db.password" is required but not provided',
    );
  });

  test("string type returns string", () => {
    const schema = {
      name: { type: "string" as const, env: "NAME" },
    };
    const config = createConfig(schema, { NAME: "hello" });
    expect(typeof config["name"]).toBe("string");
  });
});

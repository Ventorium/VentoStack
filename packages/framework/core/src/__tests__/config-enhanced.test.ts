import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspect } from "node:util";
import { loadConfig, parseArgs, safeConfig, sanitizeConfig, securityPrecheck } from "../config";
import type { ConfigSchema } from "../config";

describe("loadConfig", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ventostack-config-"));
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("loads from base.json", async () => {
    const configDir = join(tmpDir, "test-base");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, "base.json"), JSON.stringify({ port: 3000, host: "localhost" }));

    const schema: ConfigSchema = {
      port: { type: "number", default: 8080 },
      host: { type: "string", default: "0.0.0.0" },
    };

    const config = await loadConfig(schema, { basePath: configDir }, {});
    expect(config.port).toBe(3000);
    expect(config.host).toBe("localhost");
  });

  test("merges env config over base config", async () => {
    const configDir = join(tmpDir, "test-merge");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, "base.json"),
      JSON.stringify({ port: 3000, host: "localhost", debug: false }),
    );
    writeFileSync(join(configDir, "production.json"), JSON.stringify({ port: 8080, debug: false }));

    const schema: ConfigSchema = {
      port: { type: "number", default: 0 },
      host: { type: "string", default: "" },
      debug: { type: "boolean", default: true },
    };

    const config = await loadConfig(schema, { basePath: configDir, env: "production" }, {});
    expect(config.port).toBe(8080); // overridden by production.json
    expect(config.host).toBe("localhost"); // from base.json
    expect(config.debug).toBe(false); // from production.json
  });

  test("env variables override file config", async () => {
    const configDir = join(tmpDir, "test-env-override");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, "base.json"), JSON.stringify({ port: 3000 }));

    const schema: ConfigSchema = {
      port: { type: "number", env: "APP_PORT", default: 0 },
    };

    const config = await loadConfig(schema, { basePath: configDir }, { APP_PORT: "9999" });
    expect(config.port).toBe(9999);
  });

  test("sensitive fields are masked when loaded config is inspected", async () => {
    const configDir = join(tmpDir, "test-sensitive-loadconfig");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, "base.json"),
      JSON.stringify({ jwtSecret: "super-secret-value", appName: "ventostack" }),
    );

    const config = await loadConfig(
      {
        jwtSecret: { type: "string", required: true, sensitive: true },
        appName: { type: "string", default: "ventostack" },
      },
      { basePath: configDir },
      {},
    );

    expect(config.jwtSecret).toBe("super-secret-value");

    const inspected = inspect(config, { depth: null });
    expect(inspected).toContain("***");
    expect(inspected).not.toContain("super-secret-value");
  });

  test("safeConfig returns a masked snapshot for loaded config", async () => {
    const configDir = join(tmpDir, "test-safe-loadconfig");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, "base.json"),
      JSON.stringify({ jwtSecret: "super-secret-value", appName: "ventostack" }),
    );

    const config = await loadConfig(
      {
        jwtSecret: { type: "string", required: true, sensitive: true },
        appName: { type: "string", default: "ventostack" },
      },
      { basePath: configDir },
      {},
    );

    const safe = safeConfig(config);

    expect(safe.jwtSecret).toBe("***");
    expect(safe.appName).toBe("ventostack");
    expect(config.jwtSecret).toBe("super-secret-value");
  });

  test("defaults to development env", async () => {
    const configDir = join(tmpDir, "test-default-env");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, "development.json"), JSON.stringify({ mode: "dev" }));

    const schema: ConfigSchema = {
      mode: { type: "string", default: "unknown" },
    };

    const config = await loadConfig(schema, { basePath: configDir }, {});
    expect(config.mode).toBe("dev");
  });

  test("handles missing config files gracefully", async () => {
    const configDir = join(tmpDir, "test-missing");
    mkdirSync(configDir, { recursive: true });

    const schema: ConfigSchema = {
      port: { type: "number", default: 3000 },
    };

    const config = await loadConfig(schema, { basePath: configDir, env: "staging" }, {});
    expect(config.port).toBe(3000);
  });

  test("deep merges nested config", async () => {
    const configDir = join(tmpDir, "test-deep-merge");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, "base.json"),
      JSON.stringify({ db: { host: "localhost", port: 5432 } }),
    );
    writeFileSync(join(configDir, "production.json"), JSON.stringify({ db: { host: "prod-db" } }));

    const schema: ConfigSchema = {
      db: {
        host: { type: "string", default: "" },
        port: { type: "number", default: 0 },
      },
    };

    const config = await loadConfig(schema, { basePath: configDir, env: "production" }, {});
    const db = config.db as Record<string, unknown>;
    expect(db.host).toBe("prod-db");
    expect(db.port).toBe(5432); // preserved from base
  });
});

describe("parseArgs", () => {
  test("parses --key=value format", () => {
    const result = parseArgs(["--port=3000", "--host=localhost"]);
    expect(result.port).toBe("3000");
    expect(result.host).toBe("localhost");
  });

  test("parses --flag as boolean true", () => {
    const result = parseArgs(["--verbose"]);
    expect(result.verbose).toBe("true");
  });

  test("parses nested paths with dot notation", () => {
    const result = parseArgs(["--db.host=localhost", "--db.port=5432"]);
    const db = result.db as Record<string, unknown>;
    expect(db.host).toBe("localhost");
    expect(db.port).toBe("5432");
  });

  test("parses deeply nested paths", () => {
    const result = parseArgs(["--a.b.c=deep"]);
    const a = result.a as Record<string, unknown>;
    const b = a.b as Record<string, unknown>;
    expect(b.c).toBe("deep");
  });

  test("ignores non-flag arguments", () => {
    const result = parseArgs(["positional", "--flag", "another"]);
    expect(result.flag).toBe("true");
    expect(Object.keys(result)).toHaveLength(1);
  });

  test("handles empty args", () => {
    const result = parseArgs([]);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe("securityPrecheck", () => {
  test("passes when all requirements met", () => {
    const result = securityPrecheck(
      {
        requiredSecrets: ["JWT_SECRET"],
        minSecretLength: 8,
      },
      { JWT_SECRET: "a-very-long-secret-value-here!!" },
    );
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("fails when secret is missing", () => {
    const result = securityPrecheck({ requiredSecrets: ["JWT_SECRET", "DB_PASSWORD"] }, {});
    expect(result.passed).toBe(false);
    expect(result.errors).toContain("Missing required secret: JWT_SECRET");
    expect(result.errors).toContain("Missing required secret: DB_PASSWORD");
  });

  test("fails when secret is too short", () => {
    const result = securityPrecheck(
      {
        requiredSecrets: ["JWT_SECRET"],
        minSecretLength: 32,
      },
      { JWT_SECRET: "short" },
    );
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain("too short");
    expect(result.errors[0]).toContain("5 < 32");
  });

  test("fails when debug is enabled in production", () => {
    const result = securityPrecheck(
      { disallowDebug: true },
      { NODE_ENV: "production", DEBUG: "true" },
    );
    expect(result.passed).toBe(false);
    expect(result.errors).toContain("DEBUG must not be enabled in production");
  });

  test("allows debug in non-production", () => {
    const result = securityPrecheck(
      { disallowDebug: true },
      { NODE_ENV: "development", DEBUG: "true" },
    );
    expect(result.passed).toBe(true);
  });

  test("fails when HTTPS not configured in production", () => {
    const result = securityPrecheck(
      { requireHTTPS: true },
      { NODE_ENV: "production", PROTOCOL: "http" },
    );
    expect(result.passed).toBe(false);
    expect(result.errors).toContain("HTTPS is required in production");
  });

  test("passes HTTPS check in production with https", () => {
    const result = securityPrecheck(
      { requireHTTPS: true },
      { NODE_ENV: "production", PROTOCOL: "https" },
    );
    expect(result.passed).toBe(true);
  });

  test("collects multiple errors", () => {
    const result = securityPrecheck(
      {
        requiredSecrets: ["SECRET_A"],
        disallowDebug: true,
        requireHTTPS: true,
      },
      { NODE_ENV: "production", DEBUG: "1" },
    );
    expect(result.passed).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe("sanitizeConfig", () => {
  test("masks sensitive fields", () => {
    const schema: ConfigSchema = {
      host: { type: "string" },
      password: { type: "string", sensitive: true },
    };
    const config = { host: "localhost", password: "s3cret" };
    const sanitized = sanitizeConfig(schema, config);
    expect(sanitized.host).toBe("localhost");
    expect(sanitized.password).toBe("***");
  });

  test("masks nested sensitive fields", () => {
    const schema: ConfigSchema = {
      db: {
        host: { type: "string" },
        password: { type: "string", sensitive: true },
      },
    };
    const config = { db: { host: "localhost", password: "s3cret" } };
    const sanitized = sanitizeConfig(schema, config);
    const db = sanitized.db as Record<string, unknown>;
    expect(db.host).toBe("localhost");
    expect(db.password).toBe("***");
  });

  test("uses custom mask string", () => {
    const schema: ConfigSchema = {
      token: { type: "string", sensitive: true },
    };
    const config = { token: "abc123" };
    const sanitized = sanitizeConfig(schema, config, "[REDACTED]");
    expect(sanitized.token).toBe("[REDACTED]");
  });

  test("does not mask undefined sensitive fields", () => {
    const schema: ConfigSchema = {
      token: { type: "string", sensitive: true },
    };
    const config = { token: undefined };
    const sanitized = sanitizeConfig(schema, config as unknown as Record<string, unknown>);
    expect(sanitized.token).toBeUndefined();
  });
});

// ---------- 编译期类型推导测试 ----------

import { createConfig } from "../config";

describe("createConfig type inference", () => {
  test("default value makes type non-nullable", () => {
    const config = createConfig(
      {
        port: { type: "number", default: 3000 },
        host: { type: "string", default: "0.0.0.0" },
        debug: { type: "boolean", default: false },
      },
      {},
    );

    // 有 default 的字段不应包含 undefined
    const port: number = config.port;
    const host: string = config.host;
    const debug: boolean = config.debug;

    expect(port).toBe(3000);
    expect(host).toBe("0.0.0.0");
    expect(debug).toBe(false);
  });

  test("required true makes type non-nullable", () => {
    const config = createConfig(
      {
        databaseUrl: { type: "string", required: true, env: "DATABASE_URL" },
      },
      { DATABASE_URL: "postgres://localhost" },
    );

    const url: string = config.databaseUrl;
    expect(url).toBe("postgres://localhost");
  });

  test("no default and no required gives undefined", () => {
    const config = createConfig(
      {
        optionalPort: { type: "number" },
      },
      {},
    );

    // 无 default 且无 required 时应包含 undefined
    const port: number | undefined = config.optionalPort;
    expect(port).toBeUndefined();
  });

  test("default type must match field type", () => {
    // @ts-expect-error default 必须是 number 而不是 string
    createConfig({ port: { type: "number", default: "3000" } }, {});

    // @ts-expect-error default 必须是 string 而不是 number
    createConfig({ host: { type: "string", default: 0 } }, {});

    // @ts-expect-error default 必须是 boolean 而不是 string
    createConfig({ debug: { type: "boolean", default: "true" } }, {});

    // 正确类型应通过
    createConfig(
      {
        port: { type: "number", default: 3000 },
        host: { type: "string", default: "localhost" },
        debug: { type: "boolean", default: true },
      },
      {},
    );
  });

  test("options infers union type", () => {
    const config = createConfig(
      {
        logLevel: { type: "string", options: ["debug", "info", "error"] as const, default: "info" },
        mode: { type: "number", options: [1, 2, 3] as const, default: 1 },
        flag: { type: "boolean", options: [true, false] as const, default: false },
      },
      {},
    );

    // 类型应为字面量 union
    const logLevel: "debug" | "info" | "error" = config.logLevel;
    const mode: 1 | 2 | 3 = config.mode;
    const flag: true | false = config.flag;

    expect(logLevel).toBe("info");
    expect(mode).toBe(1);
    expect(flag).toBe(false);
  });

  test("options runtime validation rejects invalid value", () => {
    expect(() =>
      createConfig(
        {
          logLevel: {
            type: "string",
            options: ["debug", "info", "error"] as const,
            env: "LOG_LEVEL",
          },
        },
        { LOG_LEVEL: "warn" },
      ),
    ).toThrow('Config "logLevel": value "warn" is not in allowed options');
  });

  test("options runtime validation accepts valid value", () => {
    const config = createConfig(
      {
        logLevel: {
          type: "string",
          options: ["debug", "info", "error"] as const,
          env: "LOG_LEVEL",
        },
      },
      { LOG_LEVEL: "debug" },
    );

    expect(config.logLevel).toBe("debug");
  });

  test("sensitive fields are masked when inspected", () => {
    const config = createConfig(
      {
        jwtSecret: { type: "string", env: "JWT_SECRET", required: true, sensitive: true },
        appName: { type: "string", default: "ventostack" },
      },
      { JWT_SECRET: "super-secret-value" },
    );

    expect(config.jwtSecret).toBe("super-secret-value");

    const inspected = inspect(config, { depth: null });
    expect(inspected).toContain("***");
    expect(inspected).not.toContain("super-secret-value");
  });

  test("safeConfig returns a masked snapshot for createConfig", () => {
    const config = createConfig(
      {
        jwtSecret: { type: "string", env: "JWT_SECRET", required: true, sensitive: true },
        appName: { type: "string", default: "ventostack" },
      },
      { JWT_SECRET: "super-secret-value" },
    );

    const safe = safeConfig(config);

    expect(safe.jwtSecret).toBe("***");
    expect(safe.appName).toBe("ventostack");
    expect(config.jwtSecret).toBe("super-secret-value");
  });
});

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadConfig,
  parseArgs,
  securityPrecheck,
  sanitizeConfig,
} from "../config";
import type { ConfigSchema } from "../config";

describe("loadConfig", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "aeron-config-"));
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("loads from base.json", async () => {
    const configDir = join(tmpDir, "test-base");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, "base.json"),
      JSON.stringify({ port: 3000, host: "localhost" }),
    );

    const schema: ConfigSchema = {
      port: { type: "number", default: 8080 },
      host: { type: "string", default: "0.0.0.0" },
    };

    const config = await loadConfig(schema, { basePath: configDir }, {});
    expect(config["port"]).toBe(3000);
    expect(config["host"]).toBe("localhost");
  });

  test("merges env config over base config", async () => {
    const configDir = join(tmpDir, "test-merge");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, "base.json"),
      JSON.stringify({ port: 3000, host: "localhost", debug: false }),
    );
    writeFileSync(
      join(configDir, "production.json"),
      JSON.stringify({ port: 8080, debug: false }),
    );

    const schema: ConfigSchema = {
      port: { type: "number", default: 0 },
      host: { type: "string", default: "" },
      debug: { type: "boolean", default: true },
    };

    const config = await loadConfig(
      schema,
      { basePath: configDir, env: "production" },
      {},
    );
    expect(config["port"]).toBe(8080); // overridden by production.json
    expect(config["host"]).toBe("localhost"); // from base.json
    expect(config["debug"]).toBe(false); // from production.json
  });

  test("env variables override file config", async () => {
    const configDir = join(tmpDir, "test-env-override");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, "base.json"),
      JSON.stringify({ port: 3000 }),
    );

    const schema: ConfigSchema = {
      port: { type: "number", env: "APP_PORT", default: 0 },
    };

    const config = await loadConfig(
      schema,
      { basePath: configDir },
      { APP_PORT: "9999" },
    );
    expect(config["port"]).toBe(9999);
  });

  test("defaults to development env", async () => {
    const configDir = join(tmpDir, "test-default-env");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, "development.json"),
      JSON.stringify({ mode: "dev" }),
    );

    const schema: ConfigSchema = {
      mode: { type: "string", default: "unknown" },
    };

    const config = await loadConfig(schema, { basePath: configDir }, {});
    expect(config["mode"]).toBe("dev");
  });

  test("handles missing config files gracefully", async () => {
    const configDir = join(tmpDir, "test-missing");
    mkdirSync(configDir, { recursive: true });

    const schema: ConfigSchema = {
      port: { type: "number", default: 3000 },
    };

    const config = await loadConfig(
      schema,
      { basePath: configDir, env: "staging" },
      {},
    );
    expect(config["port"]).toBe(3000);
  });

  test("deep merges nested config", async () => {
    const configDir = join(tmpDir, "test-deep-merge");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, "base.json"),
      JSON.stringify({ db: { host: "localhost", port: 5432 } }),
    );
    writeFileSync(
      join(configDir, "production.json"),
      JSON.stringify({ db: { host: "prod-db" } }),
    );

    const schema: ConfigSchema = {
      db: {
        host: { type: "string", default: "" },
        port: { type: "number", default: 0 },
      },
    };

    const config = await loadConfig(
      schema,
      { basePath: configDir, env: "production" },
      {},
    );
    const db = config["db"] as Record<string, unknown>;
    expect(db["host"]).toBe("prod-db");
    expect(db["port"]).toBe(5432); // preserved from base
  });
});

describe("parseArgs", () => {
  test("parses --key=value format", () => {
    const result = parseArgs(["--port=3000", "--host=localhost"]);
    expect(result["port"]).toBe("3000");
    expect(result["host"]).toBe("localhost");
  });

  test("parses --flag as boolean true", () => {
    const result = parseArgs(["--verbose"]);
    expect(result["verbose"]).toBe("true");
  });

  test("parses nested paths with dot notation", () => {
    const result = parseArgs(["--db.host=localhost", "--db.port=5432"]);
    const db = result["db"] as Record<string, unknown>;
    expect(db["host"]).toBe("localhost");
    expect(db["port"]).toBe("5432");
  });

  test("parses deeply nested paths", () => {
    const result = parseArgs(["--a.b.c=deep"]);
    const a = result["a"] as Record<string, unknown>;
    const b = a["b"] as Record<string, unknown>;
    expect(b["c"]).toBe("deep");
  });

  test("ignores non-flag arguments", () => {
    const result = parseArgs(["positional", "--flag", "another"]);
    expect(result["flag"]).toBe("true");
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
    const result = securityPrecheck(
      { requiredSecrets: ["JWT_SECRET", "DB_PASSWORD"] },
      {},
    );
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
    expect(result.errors).toContain(
      "DEBUG must not be enabled in production",
    );
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
    expect(sanitized["host"]).toBe("localhost");
    expect(sanitized["password"]).toBe("***");
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
    const db = sanitized["db"] as Record<string, unknown>;
    expect(db["host"]).toBe("localhost");
    expect(db["password"]).toBe("***");
  });

  test("uses custom mask string", () => {
    const schema: ConfigSchema = {
      token: { type: "string", sensitive: true },
    };
    const config = { token: "abc123" };
    const sanitized = sanitizeConfig(schema, config, "[REDACTED]");
    expect(sanitized["token"]).toBe("[REDACTED]");
  });

  test("does not mask undefined sensitive fields", () => {
    const schema: ConfigSchema = {
      token: { type: "string", sensitive: true },
    };
    const config = { token: undefined };
    const sanitized = sanitizeConfig(schema, config as unknown as Record<string, unknown>);
    expect(sanitized["token"]).toBeUndefined();
  });
});

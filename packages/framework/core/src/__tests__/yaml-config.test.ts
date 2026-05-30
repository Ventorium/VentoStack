import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspect } from "node:util";
import { safeConfig } from "../config";
import type { ConfigSchema } from "../config";
import { loadYAMLConfig, parseYAML, stringifyYAML } from "../yaml-config";

let tmpDir: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "ventostack-yaml-config-"));
});

afterEach(() => {
  delete process.env.SERVER_HOST;
  delete process.env.DB_URL;
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("parseYAML", () => {
  test("parses key-value pairs", () => {
    const result = parseYAML("name: hello\nport: 3000");
    expect(result.name).toBe("hello");
    expect(result.port).toBe(3000);
  });

  test("parses boolean values", () => {
    const result = parseYAML("debug: true\nverbose: false");
    expect(result.debug).toBe(true);
    expect(result.verbose).toBe(false);
  });

  test("parses null values", () => {
    const result = parseYAML("value: null\nother: ~");
    expect(result.value).toBeNull();
    expect(result.other).toBeNull();
  });

  test("parses quoted strings", () => {
    const result = parseYAML("name: \"hello world\"\nother: 'single'");
    expect(result.name).toBe("hello world");
    expect(result.other).toBe("single");
  });

  test("parses nested objects", () => {
    const result = parseYAML("database:\n  host: localhost\n  port: 5432");
    expect(result.database).toEqual({ host: "localhost", port: 5432 });
  });

  test("parses arrays", () => {
    const result = parseYAML("tags:\n  - alpha\n  - beta\n  - gamma");
    expect(result.tags).toEqual(["alpha", "beta", "gamma"]);
  });

  test("skips comments", () => {
    const result = parseYAML("# comment\nname: test\n# another");
    expect(result.name).toBe("test");
  });

  test("skips empty lines", () => {
    const result = parseYAML("\nname: test\n\nport: 3000\n");
    expect(result.name).toBe("test");
    expect(result.port).toBe(3000);
  });
});

describe("loadYAMLConfig", () => {
  test("loads raw YAML when no schema is provided", async () => {
    const configDir = join(tmpDir, "raw");
    mkdirSync(configDir, { recursive: true });
    const filePath = join(configDir, "app.yaml");
    writeFileSync(filePath, "name: test\nserver:\n  port: 3000\n");

    const config = await loadYAMLConfig(filePath);

    expect(config).toEqual({
      name: "test",
      server: { port: 3000 },
    });
  });

  test("resolves env placeholders before schema validation", async () => {
    const configDir = join(tmpDir, "schema-env");
    mkdirSync(configDir, { recursive: true });
    const filePath = join(configDir, "app.yaml");
    writeFileSync(
      filePath,
      `server:\n  host: "{SERVER_HOST}"\n  port: 3000\ndatabase:\n  url: "{DB_URL}"\n`,
    );

    const schema: ConfigSchema = {
      server: {
        host: { type: "string", required: true },
        port: { type: "number", required: true },
      },
      database: {
        url: { type: "string", required: true },
      },
    };

    const config = await loadYAMLConfig(filePath, schema, {
      SERVER_HOST: "127.0.0.1",
      DB_URL: "postgres://localhost/mydb",
    });

    expect(config.server.host).toBe("127.0.0.1");
    expect(config.server.port).toBe(3000);
    expect(config.database.url).toBe("postgres://localhost/mydb");
  });

  test("env overrides process.env for placeholders", async () => {
    const configDir = join(tmpDir, "env-override");
    mkdirSync(configDir, { recursive: true });
    const filePath = join(configDir, "app.yaml");
    writeFileSync(filePath, 'server:\n  host: "{SERVER_HOST}"\n');

    process.env.SERVER_HOST = "from-process";

    const config = await loadYAMLConfig(filePath, undefined, {
      SERVER_HOST: "from-arg",
    });

    expect(config.server.host).toBe("from-arg");
  });

  test("throws when env placeholder is missing", async () => {
    const configDir = join(tmpDir, "missing-env");
    mkdirSync(configDir, { recursive: true });
    const filePath = join(configDir, "app.yaml");
    writeFileSync(filePath, 'server:\n  host: "{SERVER_HOST}"\n');

    await expect(loadYAMLConfig(filePath)).rejects.toThrow(
      'Missing environment variable "SERVER_HOST"',
    );
  });

  test("throws when schema validation fails", async () => {
    const configDir = join(tmpDir, "schema-fail");
    mkdirSync(configDir, { recursive: true });
    const filePath = join(configDir, "app.yaml");
    writeFileSync(filePath, "server:\n  port: not-a-number\n");

    const schema: ConfigSchema = {
      server: {
        port: { type: "number", required: true },
      },
    };

    await expect(loadYAMLConfig(filePath, schema)).rejects.toThrow(
      'Config "server.port": cannot coerce "not-a-number" to number',
    );
  });

  test("sensitive fields are masked when schema-loaded config is inspected", async () => {
    const configDir = join(tmpDir, "masked");
    mkdirSync(configDir, { recursive: true });
    const filePath = join(configDir, "app.yaml");
    writeFileSync(
      filePath,
      'server:\n  host: "{SERVER_HOST}"\n  port: 3000\n  token: secret-token\n',
    );

    const schema: ConfigSchema = {
      server: {
        host: { type: "string", required: true },
        port: { type: "number", required: true },
        token: { type: "string", required: true, sensitive: true },
      },
    };

    const config = await loadYAMLConfig(filePath, schema, { SERVER_HOST: "localhost" });

    expect(config.server.token).toBe("secret-token");

    const inspected = inspect(config, { depth: null });
    expect(inspected).toContain("***");
    expect(inspected).not.toContain("secret-token");
  });

  test("safeConfig returns a masked snapshot for schema-loaded YAML config", async () => {
    const configDir = join(tmpDir, "safe-yaml");
    mkdirSync(configDir, { recursive: true });
    const filePath = join(configDir, "app.yaml");
    writeFileSync(
      filePath,
      'server:\n  host: "{SERVER_HOST}"\n  port: 3000\n  token: secret-token\n',
    );

    const schema: ConfigSchema = {
      server: {
        host: { type: "string", required: true },
        port: { type: "number", required: true },
        token: { type: "string", required: true, sensitive: true },
      },
    };

    const config = await loadYAMLConfig(filePath, schema, { SERVER_HOST: "localhost" });
    const safe = safeConfig(config);

    expect(safe.server.token).toBe("***");
    expect(safe.server.host).toBe("localhost");
    expect(config.server.token).toBe("secret-token");
  });
});

describe("stringifyYAML", () => {
  test("serializes simple values", () => {
    const yaml = stringifyYAML({ name: "test", port: 3000, debug: true });
    expect(yaml).toContain("name: test");
    expect(yaml).toContain("port: 3000");
    expect(yaml).toContain("debug: true");
  });

  test("serializes null", () => {
    const yaml = stringifyYAML({ value: null });
    expect(yaml).toContain("value: null");
  });

  test("serializes nested objects", () => {
    const yaml = stringifyYAML({ db: { host: "localhost" } });
    expect(yaml).toContain("db:");
    expect(yaml).toContain("  host: localhost");
  });

  test("serializes arrays", () => {
    const yaml = stringifyYAML({ tags: ["a", "b"] });
    expect(yaml).toContain("tags:");
    expect(yaml).toContain("  - a");
    expect(yaml).toContain("  - b");
  });

  test("quotes strings with colons", () => {
    const yaml = stringifyYAML({ url: "http://localhost:3000" });
    expect(yaml).toContain('"http://localhost:3000"');
  });
});

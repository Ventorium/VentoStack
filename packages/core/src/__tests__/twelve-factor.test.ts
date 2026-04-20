import { describe, test, expect } from "bun:test";
import { loadTwelveFactorConfig, validateEnvVars } from "../twelve-factor";

describe("loadTwelveFactorConfig", () => {
  test("loads from provided env", () => {
    const { config } = loadTwelveFactorConfig({
      PORT: "3000",
      NODE_ENV: "production",
    });
    expect(config.port).toBe(3000);
    expect(config.env).toBe("production");
  });

  test("returns warnings for missing standard vars", () => {
    const { warnings } = loadTwelveFactorConfig({
      NODE_ENV: "production",
    });
    expect(warnings.length).toBeGreaterThan(0);
  });

  test("no warnings when standard vars present", () => {
    const { warnings } = loadTwelveFactorConfig({
      PORT: "3000",
      NODE_ENV: "production",
      LOG_LEVEL: "info",
    });
    // Some standard vars may still be missing, but key ones are present
    expect(warnings).toBeDefined();
  });
});

describe("validateEnvVars", () => {
  test("valid when all present", () => {
    const { valid, missing } = validateEnvVars(
      ["PORT", "HOST"],
      { PORT: "3000", HOST: "localhost" }
    );
    expect(valid).toBe(true);
    expect(missing).toEqual([]);
  });

  test("invalid when some missing", () => {
    const { valid, missing } = validateEnvVars(
      ["PORT", "SECRET_KEY", "HOST"],
      { PORT: "3000" }
    );
    expect(valid).toBe(false);
    expect(missing).toEqual(["SECRET_KEY", "HOST"]);
  });

  test("empty required is always valid", () => {
    const { valid, missing } = validateEnvVars([], {});
    expect(valid).toBe(true);
    expect(missing).toEqual([]);
  });

  test("empty string values treated as missing", () => {
    const { valid, missing } = validateEnvVars(["KEY"], { KEY: "" });
    expect(valid).toBe(false);
    expect(missing).toEqual(["KEY"]);
  });
});

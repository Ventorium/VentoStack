import { describe, test, expect } from "bun:test";
import { createDeprecationManager, createCompatibilityGuard, DEFAULT_COMPATIBILITY_POLICY } from "../deprecation";

describe("createDeprecationManager", () => {
  test("deprecate and isDeprecated", () => {
    const mgr = createDeprecationManager();
    mgr.deprecate({ path: "/users", method: "GET", version: "1.0.0" });
    expect(mgr.isDeprecated("GET", "/users")).toBeDefined();
    expect(mgr.isDeprecated("POST", "/users")).toBeUndefined();
  });

  test("deprecate updates existing notice", () => {
    const mgr = createDeprecationManager();
    mgr.deprecate({ path: "/users", method: "GET", version: "1.0.0" });
    mgr.deprecate({ path: "/users", method: "GET", version: "2.0.0", message: "updated" });
    expect(mgr.list()).toHaveLength(1);
    expect(mgr.isDeprecated("GET", "/users")!.version).toBe("2.0.0");
  });

  test("list returns all notices", () => {
    const mgr = createDeprecationManager();
    mgr.deprecate({ path: "/users", method: "GET", version: "1.0" });
    mgr.deprecate({ path: "/orders", method: "POST", version: "1.0" });
    expect(mgr.list()).toHaveLength(2);
  });

  test("headers returns Deprecation header", () => {
    const mgr = createDeprecationManager();
    mgr.deprecate({ path: "/users", method: "GET", version: "1.0" });
    const h = mgr.headers("GET", "/users");
    expect(h.Deprecation).toBe("true");
  });

  test("headers with sunset date", () => {
    const mgr = createDeprecationManager();
    mgr.deprecate({ path: "/users", method: "GET", version: "1.0", sunsetDate: "2025-12-31" });
    const h = mgr.headers("GET", "/users");
    expect(h.Sunset).toBeDefined();
  });

  test("headers with replacement", () => {
    const mgr = createDeprecationManager();
    mgr.deprecate({ path: "/users", method: "GET", version: "1.0", replacement: "/v2/users" });
    const h = mgr.headers("GET", "/users");
    expect(h.Link).toContain("/v2/users");
  });

  test("headers for non-deprecated returns empty", () => {
    const mgr = createDeprecationManager();
    expect(mgr.headers("GET", "/users")).toEqual({});
  });

  test("isSunset returns true for past date", () => {
    const mgr = createDeprecationManager();
    mgr.deprecate({ path: "/users", method: "GET", version: "1.0", sunsetDate: "2020-01-01" });
    expect(mgr.isSunset("GET", "/users")).toBe(true);
  });

  test("isSunset returns false for future date", () => {
    const mgr = createDeprecationManager();
    mgr.deprecate({ path: "/users", method: "GET", version: "1.0", sunsetDate: "2099-01-01" });
    expect(mgr.isSunset("GET", "/users")).toBe(false);
  });

  test("isSunset returns false without sunset date", () => {
    const mgr = createDeprecationManager();
    mgr.deprecate({ path: "/users", method: "GET", version: "1.0" });
    expect(mgr.isSunset("GET", "/users")).toBe(false);
  });

  test("isSunset returns false for non-deprecated", () => {
    const mgr = createDeprecationManager();
    expect(mgr.isSunset("GET", "/users")).toBe(false);
  });

  test("report generates markdown", () => {
    const mgr = createDeprecationManager();
    mgr.deprecate({ path: "/users", method: "GET", version: "1.0", message: "Use v2" });
    const report = mgr.report();
    expect(report).toContain("Deprecated APIs");
    expect(report).toContain("/users");
    expect(report).toContain("Use v2");
  });

  test("report for empty list", () => {
    const mgr = createDeprecationManager();
    const report = mgr.report();
    expect(report).toContain("No deprecated APIs");
  });
});

describe("createCompatibilityGuard", () => {
  test("non-deprecated path is allowed", () => {
    const mgr = createDeprecationManager();
    const guard = createCompatibilityGuard(mgr);
    const result = guard.check("GET", "/users");
    expect(result.allowed).toBe(true);
    expect(result.headers).toEqual({});
  });

  test("deprecated path returns warning and headers", () => {
    const mgr = createDeprecationManager();
    mgr.deprecate({ path: "/users", method: "GET", version: "1.0" });
    const guard = createCompatibilityGuard(mgr);
    const result = guard.check("GET", "/users");
    expect(result.allowed).toBe(true);
    expect(result.warning).toBeDefined();
    expect(result.headers.Deprecation).toBe("true");
  });

  test("blockAfterSunset blocks sunset APIs", () => {
    const mgr = createDeprecationManager();
    mgr.deprecate({ path: "/users", method: "GET", version: "1.0", sunsetDate: "2020-01-01" });
    const guard = createCompatibilityGuard(mgr, { blockAfterSunset: true });
    const result = guard.check("GET", "/users");
    expect(result.allowed).toBe(false);
    expect(result.warning).toContain("sunset");
  });

  test("enforceHeaders false omits headers", () => {
    const mgr = createDeprecationManager();
    mgr.deprecate({ path: "/users", method: "GET", version: "1.0" });
    const guard = createCompatibilityGuard(mgr, { enforceHeaders: false });
    const result = guard.check("GET", "/users");
    expect(result.headers).toEqual({});
  });
});

describe("DEFAULT_COMPATIBILITY_POLICY", () => {
  test("has default values", () => {
    expect(DEFAULT_COMPATIBILITY_POLICY.versionWindow).toBe(2);
    expect(DEFAULT_COMPATIBILITY_POLICY.sunsetDays).toBe(90);
    expect(DEFAULT_COMPATIBILITY_POLICY.enforceHeaders).toBe(true);
    expect(DEFAULT_COMPATIBILITY_POLICY.blockAfterSunset).toBe(false);
  });
});

import { describe, test, expect } from "bun:test";
import { createDocVersionManager } from "../doc-version";

describe("createDocVersionManager", () => {
  test("addVersion and getVersion", () => {
    const mgr = createDocVersionManager();
    mgr.addVersion("1.0.0", { paths: {} }, "Initial release");
    const v = mgr.getVersion("1.0.0");
    expect(v).toBeDefined();
    expect(v!.version).toBe("1.0.0");
    expect(v!.description).toBe("Initial release");
  });

  test("getLatest returns last added", () => {
    const mgr = createDocVersionManager();
    mgr.addVersion("1.0.0", {});
    mgr.addVersion("2.0.0", {});
    expect(mgr.getLatest()!.version).toBe("2.0.0");
  });

  test("getLatest returns undefined when empty", () => {
    const mgr = createDocVersionManager();
    expect(mgr.getLatest()).toBeUndefined();
  });

  test("getVersion returns undefined for unknown", () => {
    const mgr = createDocVersionManager();
    expect(mgr.getVersion("9.9.9")).toBeUndefined();
  });

  test("list returns all versions", () => {
    const mgr = createDocVersionManager();
    mgr.addVersion("1.0.0", {});
    mgr.addVersion("2.0.0", {});
    expect(mgr.list()).toHaveLength(2);
  });

  test("compare detects added paths", () => {
    const mgr = createDocVersionManager();
    mgr.addVersion("1.0.0", { paths: {} });
    mgr.addVersion("2.0.0", { paths: { "/users": { get: {} } } });
    const diff = mgr.compare("1.0.0", "2.0.0");
    expect(diff).toBeDefined();
    expect(diff!.added).toContain("GET /users");
  });

  test("compare detects removed paths", () => {
    const mgr = createDocVersionManager();
    mgr.addVersion("1.0.0", { paths: { "/users": { get: {} } } });
    mgr.addVersion("2.0.0", { paths: {} });
    const diff = mgr.compare("1.0.0", "2.0.0");
    expect(diff!.removed).toContain("GET /users");
  });

  test("compare detects modified paths", () => {
    const mgr = createDocVersionManager();
    mgr.addVersion("1.0.0", { paths: { "/users": { get: { summary: "v1" } } } });
    mgr.addVersion("2.0.0", { paths: { "/users": { get: { summary: "v2" } } } });
    const diff = mgr.compare("1.0.0", "2.0.0");
    expect(diff!.modified).toContain("GET /users");
  });

  test("compare returns undefined for missing versions", () => {
    const mgr = createDocVersionManager();
    expect(mgr.compare("1.0.0", "2.0.0")).toBeUndefined();
  });
});

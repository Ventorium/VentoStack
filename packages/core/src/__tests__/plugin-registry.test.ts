import { describe, test, expect } from "bun:test";
import { createPluginRegistry } from "../plugin-registry";

describe("createPluginRegistry", () => {
  test("register adds plugin", () => {
    const reg = createPluginRegistry();
    reg.register({ name: "test", version: "1.0.0" });
    expect(reg.has("test")).toBe(true);
  });

  test("register duplicate throws", () => {
    const reg = createPluginRegistry();
    reg.register({ name: "test", version: "1.0.0" });
    expect(() => reg.register({ name: "test", version: "1.0.0" })).toThrow("already registered");
  });

  test("unregister removes plugin", () => {
    const reg = createPluginRegistry();
    reg.register({ name: "test", version: "1.0.0" });
    expect(reg.unregister("test")).toBe(true);
    expect(reg.has("test")).toBe(false);
  });

  test("unregister returns false for unknown", () => {
    const reg = createPluginRegistry();
    expect(reg.unregister("nope")).toBe(false);
  });

  test("get returns entry with timestamp", () => {
    const reg = createPluginRegistry();
    reg.register({ name: "test", version: "1.0.0", description: "A test" });
    const entry = reg.get("test");
    expect(entry).toBeDefined();
    expect(entry!.manifest.name).toBe("test");
    expect(entry!.installedAt).toBeGreaterThan(0);
  });

  test("get returns undefined for unknown", () => {
    const reg = createPluginRegistry();
    expect(reg.get("nope")).toBeUndefined();
  });

  test("list returns all entries", () => {
    const reg = createPluginRegistry();
    reg.register({ name: "a", version: "1.0" });
    reg.register({ name: "b", version: "2.0" });
    expect(reg.list()).toHaveLength(2);
  });

  test("search by name", () => {
    const reg = createPluginRegistry();
    reg.register({ name: "auth-plugin", version: "1.0" });
    reg.register({ name: "cache-plugin", version: "1.0" });
    expect(reg.search("auth")).toHaveLength(1);
    expect(reg.search("plugin")).toHaveLength(2);
  });

  test("search by description", () => {
    const reg = createPluginRegistry();
    reg.register({ name: "x", version: "1.0", description: "Authentication handler" });
    expect(reg.search("authentication")).toHaveLength(1);
  });

  test("search by keywords", () => {
    const reg = createPluginRegistry();
    reg.register({ name: "x", version: "1.0", keywords: ["security", "auth"] });
    expect(reg.search("security")).toHaveLength(1);
  });

  test("checkDependencies satisfied", () => {
    const reg = createPluginRegistry();
    reg.register({ name: "base", version: "1.0" });
    reg.register({ name: "ext", version: "1.0", dependencies: ["base"] });
    const check = reg.checkDependencies("ext");
    expect(check.satisfied).toBe(true);
    expect(check.missing).toEqual([]);
  });

  test("checkDependencies missing", () => {
    const reg = createPluginRegistry();
    reg.register({ name: "ext", version: "1.0", dependencies: ["base", "core"] });
    const check = reg.checkDependencies("ext");
    expect(check.satisfied).toBe(false);
    expect(check.missing).toEqual(["base", "core"]);
  });

  test("checkDependencies for unknown plugin", () => {
    const reg = createPluginRegistry();
    const check = reg.checkDependencies("unknown");
    expect(check.satisfied).toBe(false);
    expect(check.missing).toEqual(["unknown"]);
  });
});

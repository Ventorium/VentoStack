import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createFixtureManager } from "../fixture";

describe("createFixtureManager", () => {
  test("register and get a fixture", () => {
    const manager = createFixtureManager();
    manager.register("user", { id: 1, name: "Alice" });
    const user = manager.get<{ id: number; name: string }>("user");
    expect(user).toEqual({ id: 1, name: "Alice" });
  });

  test("has returns true for registered fixtures", () => {
    const manager = createFixtureManager();
    manager.register("data", [1, 2, 3]);
    expect(manager.has("data")).toBe(true);
    expect(manager.has("missing")).toBe(false);
  });

  test("get throws for unregistered fixture", () => {
    const manager = createFixtureManager();
    expect(() => manager.get("nope")).toThrow('Fixture "nope" not found');
  });

  test("register throws for duplicate name", () => {
    const manager = createFixtureManager();
    manager.register("dup", 1);
    expect(() => manager.register("dup", 2)).toThrow(
      'Fixture "dup" is already registered',
    );
  });

  test("reset clears all fixtures", () => {
    const manager = createFixtureManager();
    manager.register("a", 1);
    manager.register("b", 2);
    manager.reset();
    expect(manager.has("a")).toBe(false);
    expect(manager.has("b")).toBe(false);
  });

  test("loadJSON loads fixture from file", async () => {
    const manager = createFixtureManager();
    const tmpPath = join(import.meta.dir, "__fixture_test.json");
    await Bun.write(tmpPath, JSON.stringify({ key: "value" }));

    try {
      await manager.loadJSON("jsonData", tmpPath);
      expect(manager.get("jsonData")).toEqual({ key: "value" });
    } finally {
      const { unlinkSync } = await import("node:fs");
      unlinkSync(tmpPath);
    }
  });

  test("loadJSON throws for missing file", async () => {
    const manager = createFixtureManager();
    await expect(
      manager.loadJSON("missing", "/nonexistent/path.json"),
    ).rejects.toThrow("Fixture file not found");
  });

  test("loadJSON overwrites existing fixture with same name", async () => {
    const manager = createFixtureManager();
    const tmpPath = join(import.meta.dir, "__fixture_overwrite.json");
    await Bun.write(tmpPath, JSON.stringify({ v: 2 }));

    try {
      manager.register("over", { v: 1 });
      // loadJSON uses store.set directly, so it can overwrite
      await manager.loadJSON("over", tmpPath);
      expect(manager.get("over")).toEqual({ v: 2 });
    } finally {
      const { unlinkSync } = await import("node:fs");
      unlinkSync(tmpPath);
    }
  });

  test("supports various data types", () => {
    const manager = createFixtureManager();
    manager.register("str", "hello");
    manager.register("num", 42);
    manager.register("arr", [1, 2, 3]);
    manager.register("bool", true);

    expect(manager.get("str")).toBe("hello");
    expect(manager.get("num")).toBe(42);
    expect(manager.get("arr")).toEqual([1, 2, 3]);
    expect(manager.get("bool")).toBe(true);
  });
});

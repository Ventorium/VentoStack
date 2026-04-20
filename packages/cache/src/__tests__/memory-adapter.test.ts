import { describe, test, expect } from "bun:test";
import { createMemoryAdapter } from "../memory-adapter";

describe("createMemoryAdapter", () => {
  test("get returns null for missing key", async () => {
    const adapter = createMemoryAdapter();
    expect(await adapter.get("missing")).toBeNull();
  });

  test("set and get", async () => {
    const adapter = createMemoryAdapter();
    await adapter.set("key", "value");
    expect(await adapter.get("key")).toBe("value");
  });

  test("set overwrites existing value", async () => {
    const adapter = createMemoryAdapter();
    await adapter.set("key", "v1");
    await adapter.set("key", "v2");
    expect(await adapter.get("key")).toBe("v2");
  });

  test("del removes key", async () => {
    const adapter = createMemoryAdapter();
    await adapter.set("key", "value");
    await adapter.del("key");
    expect(await adapter.get("key")).toBeNull();
  });

  test("del on missing key does not throw", async () => {
    const adapter = createMemoryAdapter();
    await adapter.del("missing");
  });

  test("has returns true for existing key", async () => {
    const adapter = createMemoryAdapter();
    await adapter.set("key", "value");
    expect(await adapter.has("key")).toBe(true);
  });

  test("has returns false for missing key", async () => {
    const adapter = createMemoryAdapter();
    expect(await adapter.has("missing")).toBe(false);
  });

  test("flush clears all keys", async () => {
    const adapter = createMemoryAdapter();
    await adapter.set("a", "1");
    await adapter.set("b", "2");
    await adapter.flush();
    expect(await adapter.get("a")).toBeNull();
    expect(await adapter.get("b")).toBeNull();
  });

  test("keys returns matching keys with wildcard", async () => {
    const adapter = createMemoryAdapter();
    await adapter.set("user:1", "a");
    await adapter.set("user:2", "b");
    await adapter.set("post:1", "c");
    const result = await adapter.keys("user:*");
    expect(result.sort()).toEqual(["user:1", "user:2"]);
  });

  test("keys returns all keys with *", async () => {
    const adapter = createMemoryAdapter();
    await adapter.set("a", "1");
    await adapter.set("b", "2");
    const result = await adapter.keys("*");
    expect(result.sort()).toEqual(["a", "b"]);
  });

  test("keys returns empty array when no match", async () => {
    const adapter = createMemoryAdapter();
    await adapter.set("a", "1");
    const result = await adapter.keys("z*");
    expect(result).toEqual([]);
  });

  test("TTL: key expires after ttl", async () => {
    const adapter = createMemoryAdapter();
    await adapter.set("key", "value", 1);
    expect(await adapter.get("key")).toBe("value");
    await Bun.sleep(1100);
    expect(await adapter.get("key")).toBeNull();
  });

  test("TTL: has returns false after expiry", async () => {
    const adapter = createMemoryAdapter();
    await adapter.set("key", "value", 1);
    await Bun.sleep(1100);
    expect(await adapter.has("key")).toBe(false);
  });

  test("TTL: expired keys excluded from keys()", async () => {
    const adapter = createMemoryAdapter();
    await adapter.set("a", "1", 1);
    await adapter.set("b", "2");
    await Bun.sleep(1100);
    const result = await adapter.keys("*");
    expect(result).toEqual(["b"]);
  });

  test("set without TTL does not expire", async () => {
    const adapter = createMemoryAdapter();
    await adapter.set("key", "value");
    await Bun.sleep(100);
    expect(await adapter.get("key")).toBe("value");
  });
});

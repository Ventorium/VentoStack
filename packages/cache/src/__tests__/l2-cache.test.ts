import { describe, test, expect } from "bun:test";
import { createL2Cache } from "../l2-cache";
import type { CacheAdapter } from "../cache";

function mockL2(): CacheAdapter & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    async get(key: string) { return store.get(key) ?? null; },
    async set(key: string, value: string) { store.set(key, value); },
    async delete(key: string) { store.delete(key); },
    async has(key: string) { return store.has(key); },
  };
}

describe("createL2Cache", () => {
  test("set and get from L1", async () => {
    const l2 = mockL2();
    const cache = createL2Cache(l2);
    await cache.set("key", { name: "test" });
    const val = await cache.get("key");
    expect(val).toEqual({ name: "test" });
    expect(cache.stats().l1Hits).toBe(1);
  });

  test("get from L2 on L1 miss", async () => {
    const l2 = mockL2();
    const cache = createL2Cache(l2, { l1TTL: 1 }); // 1ms TTL
    await cache.set("key", { name: "test" });
    await Bun.sleep(10); // L1 expires
    const val = await cache.get("key");
    expect(val).toEqual({ name: "test" });
    expect(cache.stats().l2Hits).toBe(1);
  });

  test("miss returns null", async () => {
    const l2 = mockL2();
    const cache = createL2Cache(l2);
    const val = await cache.get("nope");
    expect(val).toBeNull();
    expect(cache.stats().misses).toBe(1);
  });

  test("delete removes from both layers", async () => {
    const l2 = mockL2();
    const cache = createL2Cache(l2);
    await cache.set("key", "val");
    await cache.delete("key");
    expect(await cache.get("key")).toBeNull();
    expect(l2.store.has("key")).toBe(false);
  });

  test("clear resets stats", async () => {
    const l2 = mockL2();
    const cache = createL2Cache(l2);
    await cache.set("key", "val");
    await cache.get("key");
    await cache.clear();
    expect(cache.stats().l1Hits).toBe(0);
    expect(cache.stats().l1Size).toBe(0);
  });

  test("writeThrough disabled", async () => {
    const l2 = mockL2();
    const cache = createL2Cache(l2, { writeThrough: false });
    await cache.set("key", "val");
    expect(l2.store.has("key")).toBe(false);
  });

  test("L1 max size eviction", async () => {
    const l2 = mockL2();
    const cache = createL2Cache(l2, { l1MaxSize: 2 });
    await cache.set("a", 1);
    await cache.set("b", 2);
    await cache.set("c", 3);
    expect(cache.stats().l1Size).toBeLessThanOrEqual(2);
  });
});

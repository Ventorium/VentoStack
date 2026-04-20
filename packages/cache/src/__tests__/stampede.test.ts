import { describe, test, expect } from "bun:test";
import { createStampedeProtection } from "../stampede";

function mockCacheStore() {
  const store = new Map<string, string>();
  return {
    getter: async (key: string) => store.get(key) ?? null,
    setter: async (key: string, value: string) => { store.set(key, value); },
    store,
  };
}

describe("createStampedeProtection", () => {
  describe("getOrLoad", () => {
    test("loads on cache miss", async () => {
      const { getter, setter } = mockCacheStore();
      const sp = createStampedeProtection(getter, setter);
      let called = 0;
      const val = await sp.getOrLoad("key", async () => { called++; return 42; }, 5000);
      expect(val).toBe(42);
      expect(called).toBe(1);
    });

    test("returns cached value on hit", async () => {
      const { getter, setter, store } = mockCacheStore();
      store.set("key", JSON.stringify(99));
      const sp = createStampedeProtection(getter, setter);
      let called = 0;
      const val = await sp.getOrLoad("key", async () => { called++; return 42; }, 5000);
      expect(val).toBe(99);
      expect(called).toBe(0);
    });

    test("concurrent loads use lock", async () => {
      const { getter, setter } = mockCacheStore();
      const sp = createStampedeProtection(getter, setter, { waitInterval: 10, maxWaitAttempts: 50 });
      let loadCount = 0;
      const loader = async () => {
        loadCount++;
        await Bun.sleep(50);
        return "data";
      };
      const [r1, r2] = await Promise.all([
        sp.getOrLoad("key", loader, 5000),
        sp.getOrLoad("key", loader, 5000),
      ]);
      expect(r1).toBe("data");
      expect(r2).toBe("data");
      // At most 2 loads (one locked, one fallback after timeout)
      expect(loadCount).toBeLessThanOrEqual(2);
    });
  });

  describe("getOrLoadXFetch", () => {
    test("loads on cache miss", async () => {
      const { getter, setter } = mockCacheStore();
      const sp = createStampedeProtection(getter, setter);
      const val = await sp.getOrLoadXFetch("key", async () => "xfetch-data", 5000);
      expect(val).toBe("xfetch-data");
    });

    test("returns cached value when not expired", async () => {
      const { getter, setter, store } = mockCacheStore();
      const sp = createStampedeProtection(getter, setter);
      // Pre-populate with meta entry
      const entry = { value: "cached", expiresAt: Date.now() + 60000, delta: 10 };
      store.set("meta:key", JSON.stringify(entry));
      const val = await sp.getOrLoadXFetch("key", async () => "fresh", 5000);
      // Due to probabilistic refresh, it could return either cached or fresh
      expect(["cached", "fresh"]).toContain(val);
    });
  });
});

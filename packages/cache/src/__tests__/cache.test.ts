import { describe, test, expect } from "bun:test";
import { createCache } from "../cache";
import { createMemoryAdapter } from "../memory-adapter";

function setup() {
  const adapter = createMemoryAdapter();
  const cache = createCache(adapter);
  return { adapter, cache };
}

describe("createCache", () => {
  test("get returns null for missing key", async () => {
    const { cache } = setup();
    expect(await cache.get("missing")).toBeNull();
  });

  test("set and get with JSON serialization", async () => {
    const { cache } = setup();
    await cache.set("user", { id: 1, name: "Alice" });
    expect(await cache.get("user")).toEqual({ id: 1, name: "Alice" });
  });

  test("set with TTL expires", async () => {
    const { cache } = setup();
    await cache.set("key", "value", { ttl: 1 });
    expect(await cache.get("key")).toBe("value");
    await Bun.sleep(1100);
    expect(await cache.get("key")).toBeNull();
  });

  test("del removes key", async () => {
    const { cache } = setup();
    await cache.set("key", "value");
    await cache.del("key");
    expect(await cache.get("key")).toBeNull();
  });

  test("has returns correct boolean", async () => {
    const { cache } = setup();
    expect(await cache.has("key")).toBe(false);
    await cache.set("key", "value");
    expect(await cache.has("key")).toBe(true);
  });

  test("flush clears all cache", async () => {
    const { cache } = setup();
    await cache.set("a", 1);
    await cache.set("b", 2);
    await cache.flush();
    expect(await cache.get("a")).toBeNull();
    expect(await cache.get("b")).toBeNull();
  });

  describe("tags", () => {
    test("tagged set and get", async () => {
      const { cache } = setup();
      const tagged = cache.tags(["posts"]);
      await tagged.set("post:1", { title: "Hello" });
      expect(await tagged.get("post:1")).toEqual({ title: "Hello" });
    });

    test("tags flush removes only tagged keys", async () => {
      const { cache } = setup();
      await cache.set("untagged", "keep");
      const tagged = cache.tags(["posts"]);
      await tagged.set("post:1", "a");
      await tagged.set("post:2", "b");
      await tagged.flush();
      expect(await cache.get("post:1")).toBeNull();
      expect(await cache.get("post:2")).toBeNull();
      expect(await cache.get("untagged")).toBe("keep");
    });

    test("flush with multiple tags", async () => {
      const { cache } = setup();
      const tagged1 = cache.tags(["tag-a"]);
      const tagged2 = cache.tags(["tag-b"]);
      await tagged1.set("a", 1);
      await tagged2.set("b", 2);
      // flush tag-a should only remove "a"
      await cache.tags(["tag-a"]).flush();
      expect(await cache.get("a")).toBeNull();
      expect(await cache.get("b")).toBe(2);
    });

    test("set via cache.set with tags option", async () => {
      const { cache } = setup();
      await cache.set("item:1", "val", { tags: ["items"] });
      await cache.tags(["items"]).flush();
      expect(await cache.get("item:1")).toBeNull();
    });
  });

  describe("remember", () => {
    test("calls factory on miss and caches result", async () => {
      const { cache } = setup();
      let calls = 0;
      const factory = async () => {
        calls++;
        return { data: "fresh" };
      };
      const result = await cache.remember("key", 60, factory);
      expect(result).toEqual({ data: "fresh" });
      expect(calls).toBe(1);

      // Second call should use cache
      const result2 = await cache.remember("key", 60, factory);
      expect(result2).toEqual({ data: "fresh" });
      expect(calls).toBe(1);
    });

    test("returns cached value on hit", async () => {
      const { cache } = setup();
      await cache.set("key", "cached");
      const result = await cache.remember("key", 60, async () => "factory");
      expect(result).toBe("cached");
    });

    test("respects TTL on cached value", async () => {
      const { cache } = setup();
      let calls = 0;
      await cache.remember("key", 1, async () => {
        calls++;
        return "value";
      });
      expect(calls).toBe(1);
      await Bun.sleep(1100);
      await cache.remember("key", 1, async () => {
        calls++;
        return "new-value";
      });
      expect(calls).toBe(2);
    });
  });

  describe("singleflight", () => {
    test("concurrent calls share same factory execution", async () => {
      const { cache } = setup();
      let calls = 0;
      const factory = async () => {
        calls++;
        await Bun.sleep(100);
        return "result";
      };

      const [r1, r2, r3] = await Promise.all([
        cache.singleflight("key", factory),
        cache.singleflight("key", factory),
        cache.singleflight("key", factory),
      ]);

      expect(calls).toBe(1);
      expect(r1).toBe("result");
      expect(r2).toBe("result");
      expect(r3).toBe("result");
    });

    test("different keys run separate factories", async () => {
      const { cache } = setup();
      let calls = 0;
      const factory = async () => {
        calls++;
        return "result";
      };

      await Promise.all([
        cache.singleflight("a", factory),
        cache.singleflight("b", factory),
      ]);

      expect(calls).toBe(2);
    });

    test("after completion, new call runs factory again", async () => {
      const { cache } = setup();
      let calls = 0;
      const factory = async () => {
        calls++;
        return "result";
      };

      await cache.singleflight("key", factory);
      expect(calls).toBe(1);

      await cache.singleflight("key", factory);
      expect(calls).toBe(2);
    });

    test("propagates factory errors to all callers", async () => {
      const { cache } = setup();
      let calls = 0;
      const factory = async () => {
        calls++;
        throw new Error("boom");
      };

      const results = await Promise.allSettled([
        cache.singleflight("key", factory),
        cache.singleflight("key", factory),
      ]);

      expect(calls).toBe(1);
      expect(results[0].status).toBe("rejected");
      expect(results[1].status).toBe("rejected");
    });
  });
});

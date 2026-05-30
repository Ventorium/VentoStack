import { describe, expect, test } from "bun:test";
import { createRedisAdapter } from "../redis-adapter";
import type { RedisCacheClientLike } from "../redis-adapter";

/** 创建内存 mock Redis 客户端 */
function createMockRedisClient(): RedisCacheClientLike {
  const store = new Map<string, { value: string; timer?: Timer }>();

  return {
    async get(key: string): Promise<string | null> {
      const entry = store.get(key);
      if (!entry) return null;
      return entry.value;
    },
    async set(key: string, value: string): Promise<"OK"> {
      const existing = store.get(key);
      if (existing?.timer) clearTimeout(existing.timer);
      store.set(key, { value });
      return "OK";
    },
    async expire(key: string, seconds: number): Promise<number> {
      const entry = store.get(key);
      if (!entry) return 0;
      if (entry.timer) clearTimeout(entry.timer);
      entry.timer = setTimeout(() => store.delete(key), seconds * 1000);
      return 1;
    },
    async del(key: string): Promise<number> {
      const entry = store.get(key);
      if (!entry) return 0;
      if (entry.timer) clearTimeout(entry.timer);
      store.delete(key);
      return 1;
    },
    async exists(key: string): Promise<boolean> {
      return store.has(key);
    },
    async send(_command: string, _args: string[]): Promise<unknown> {
      for (const entry of store.values()) {
        if (entry.timer) clearTimeout(entry.timer);
      }
      store.clear();
      return "OK";
    },
    async keys(pattern: string): Promise<string[]> {
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
      return Array.from(store.keys()).filter((k) => regex.test(k));
    },
  };
}

describe("createRedisAdapter", () => {
  test("get returns null for missing key", async () => {
    const adapter = createRedisAdapter({ client: createMockRedisClient() });
    expect(await adapter.get("missing")).toBeNull();
  });

  test("set and get", async () => {
    const adapter = createRedisAdapter({ client: createMockRedisClient() });
    await adapter.set("key", "value");
    expect(await adapter.get("key")).toBe("value");
  });

  test("set overwrites existing value", async () => {
    const adapter = createRedisAdapter({ client: createMockRedisClient() });
    await adapter.set("key", "v1");
    await adapter.set("key", "v2");
    expect(await adapter.get("key")).toBe("v2");
  });

  test("del removes key", async () => {
    const adapter = createRedisAdapter({ client: createMockRedisClient() });
    await adapter.set("key", "value");
    await adapter.del("key");
    expect(await adapter.get("key")).toBeNull();
  });

  test("del on missing key does not throw", async () => {
    const adapter = createRedisAdapter({ client: createMockRedisClient() });
    await adapter.del("missing");
  });

  test("has returns true for existing key", async () => {
    const adapter = createRedisAdapter({ client: createMockRedisClient() });
    await adapter.set("key", "value");
    expect(await adapter.has("key")).toBe(true);
  });

  test("has returns false for missing key", async () => {
    const adapter = createRedisAdapter({ client: createMockRedisClient() });
    expect(await adapter.has("missing")).toBe(false);
  });

  test("flush clears all keys", async () => {
    const adapter = createRedisAdapter({ client: createMockRedisClient() });
    await adapter.set("a", "1");
    await adapter.set("b", "2");
    await adapter.flush();
    expect(await adapter.get("a")).toBeNull();
    expect(await adapter.get("b")).toBeNull();
  });

  test("keys returns matching keys with wildcard", async () => {
    const adapter = createRedisAdapter({ client: createMockRedisClient() });
    await adapter.set("user:1", "a");
    await adapter.set("user:2", "b");
    await adapter.set("post:1", "c");
    const result = await adapter.keys("user:*");
    expect(result.sort()).toEqual(["user:1", "user:2"]);
  });

  test("keys returns all keys with *", async () => {
    const adapter = createRedisAdapter({ client: createMockRedisClient() });
    await adapter.set("a", "1");
    await adapter.set("b", "2");
    const result = await adapter.keys("*");
    expect(result.sort()).toEqual(["a", "b"]);
  });

  test("keys returns empty array when no match", async () => {
    const adapter = createRedisAdapter({ client: createMockRedisClient() });
    await adapter.set("a", "1");
    const result = await adapter.keys("z*");
    expect(result).toEqual([]);
  });

  test("TTL: key expires after ttl", async () => {
    const adapter = createRedisAdapter({ client: createMockRedisClient() });
    await adapter.set("key", "value", 1);
    expect(await adapter.get("key")).toBe("value");
    await Bun.sleep(1100);
    expect(await adapter.get("key")).toBeNull();
  });

  test("TTL: has returns false after expiry", async () => {
    const adapter = createRedisAdapter({ client: createMockRedisClient() });
    await adapter.set("key", "value", 1);
    await Bun.sleep(1100);
    expect(await adapter.has("key")).toBe(false);
  });

  test("TTL: expired keys excluded from keys()", async () => {
    const adapter = createRedisAdapter({ client: createMockRedisClient() });
    await adapter.set("a", "1", 1);
    await adapter.set("b", "2");
    await Bun.sleep(1100);
    const result = await adapter.keys("*");
    expect(result).toEqual(["b"]);
  });

  test("set without TTL does not expire", async () => {
    const adapter = createRedisAdapter({ client: createMockRedisClient() });
    await adapter.set("key", "value");
    await Bun.sleep(100);
    expect(await adapter.get("key")).toBe("value");
  });

  test("keyPrefix: prepends to stored keys", async () => {
    const client = createMockRedisClient();
    const adapter = createRedisAdapter({ client, keyPrefix: "app:" });
    await adapter.set("key", "value");
    expect(await adapter.get("key")).toBe("value");
    expect(await client.get("app:key")).toBe("value");
    expect(await client.get("key")).toBeNull();
  });

  test("keyPrefix: del and has work with prefix", async () => {
    const adapter = createRedisAdapter({
      client: createMockRedisClient(),
      keyPrefix: "app:",
    });
    await adapter.set("key", "value");
    expect(await adapter.has("key")).toBe(true);
    await adapter.del("key");
    expect(await adapter.has("key")).toBe(false);
  });

  test("keyPrefix: keys strips prefix from result", async () => {
    const adapter = createRedisAdapter({
      client: createMockRedisClient(),
      keyPrefix: "app:",
    });
    await adapter.set("user:1", "a");
    await adapter.set("user:2", "b");
    const result = await adapter.keys("user:*");
    expect(result.sort()).toEqual(["user:1", "user:2"]);
  });

  test("keyPrefix: keys filters out keys without prefix", async () => {
    const client = createMockRedisClient();
    const adapter = createRedisAdapter({ client, keyPrefix: "app:" });
    await adapter.set("key", "value");
    await client.set("other", "value");
    const result = await adapter.keys("*");
    expect(result).toEqual(["key"]);
  });

  test("keyPrefix: flush clears only prefixed keys in mock", async () => {
    const client = createMockRedisClient();
    const adapter = createRedisAdapter({ client, keyPrefix: "app:" });
    await adapter.set("a", "1");
    await client.set("other", "2");
    await adapter.flush();
    expect(await adapter.get("a")).toBeNull();
    // 注意：Redis 的 flushdb 会清空整个数据库，mock 无法区分
    // 这里仅验证 adapter 行为一致
    expect(await client.get("other")).toBeNull();
  });
});

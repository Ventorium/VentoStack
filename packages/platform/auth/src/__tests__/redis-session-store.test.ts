import { describe, expect, test } from "bun:test";
import { createRedisSessionStore } from "../redis-session-store";
import type { RedisSessionClientLike } from "../redis-session-store";

/** 创建内存 mock Redis 客户端 */
function createMockRedisClient(): RedisSessionClientLike & {
  store: Map<string, { value: string; timer?: Timer }>;
} {
  const store = new Map<string, { value: string; timer?: Timer }>();

  return {
    store,
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
    async sadd(key: string, ...members: string[]): Promise<number> {
      // Simulate Redis set using a JSON array stored at the key
      let existing: string[] = [];
      const entry = store.get(key);
      if (entry) {
        try {
          existing = JSON.parse(entry.value) as string[];
        } catch {
          existing = [];
        }
      }
      let added = 0;
      for (const m of members) {
        if (!existing.includes(m)) {
          existing.push(m);
          added++;
        }
      }
      store.set(key, { value: JSON.stringify(existing) });
      return added;
    },
    async srem(key: string, ...members: string[]): Promise<number> {
      const entry = store.get(key);
      if (!entry) return 0;
      let existing: string[] = [];
      try {
        existing = JSON.parse(entry.value) as string[];
      } catch {
        return 0;
      }
      let removed = 0;
      for (const m of members) {
        const idx = existing.indexOf(m);
        if (idx !== -1) {
          existing.splice(idx, 1);
          removed++;
        }
      }
      store.set(key, { value: JSON.stringify(existing) });
      return removed;
    },
    async smembers(key: string): Promise<string[]> {
      const entry = store.get(key);
      if (!entry) return [];
      try {
        return JSON.parse(entry.value) as string[];
      } catch {
        return [];
      }
    },
  };
}

describe("createRedisSessionStore", () => {
  test("implements SessionStore interface", async () => {
    const store = createRedisSessionStore({ client: createMockRedisClient() });
    const session = {
      id: "test-id",
      data: { key: "value" },
      expiresAt: Date.now() + 60000,
    };

    await store.set(session);
    const retrieved = await store.get("test-id");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.data.key).toBe("value");

    await store.touch("test-id", 120);
    const touched = await store.get("test-id");
    expect(touched).not.toBeNull();

    await store.delete("test-id");
    const deleted = await store.get("test-id");
    expect(deleted).toBeNull();
  });

  test("get returns null for missing session", async () => {
    const store = createRedisSessionStore({ client: createMockRedisClient() });
    const result = await store.get("non-existent");
    expect(result).toBeNull();
  });

  test("get returns null for expired session", async () => {
    const store = createRedisSessionStore({ client: createMockRedisClient() });
    await store.set({
      id: "expired",
      data: {},
      expiresAt: Date.now() - 1000,
    });
    // TTL is set to 0 (already expired), but mock may not expire immediately
    // Wait for potential expiry
    await Bun.sleep(100);
    const result = await store.get("expired");
    expect(result).toBeNull();
  });

  test("set stores session with JSON serialization", async () => {
    const client = createMockRedisClient();
    const store = createRedisSessionStore({ client });
    const session = {
      id: "s1",
      data: { userId: "u1", role: "admin" },
      expiresAt: Date.now() + 3600_000,
    };

    await store.set(session);
    const raw = await client.get("session:s1");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.id).toBe("s1");
    expect(parsed.data.userId).toBe("u1");
  });

  test("set applies TTL based on expiresAt", async () => {
    const client = createMockRedisClient();
    const store = createRedisSessionStore({ client });
    await store.set({
      id: "ttl-test",
      data: {},
      expiresAt: Date.now() + 1000,
    });
    expect(await store.get("ttl-test")).not.toBeNull();
    await Bun.sleep(1100);
    expect(await store.get("ttl-test")).toBeNull();
  });

  test("delete removes session", async () => {
    const store = createRedisSessionStore({ client: createMockRedisClient() });
    await store.set({
      id: "to-delete",
      data: {},
      expiresAt: Date.now() + 60000,
    });
    await store.delete("to-delete");
    expect(await store.get("to-delete")).toBeNull();
  });

  test("delete on missing session does not throw", async () => {
    const store = createRedisSessionStore({ client: createMockRedisClient() });
    await store.delete("non-existent");
  });

  test("touch extends TTL", async () => {
    const store = createRedisSessionStore({ client: createMockRedisClient() });
    await store.set({
      id: "touch-test",
      data: {},
      expiresAt: Date.now() + 1000,
    });
    await store.touch("touch-test", 3600);
    await Bun.sleep(1100);
    expect(await store.get("touch-test")).not.toBeNull();
  });

  test("touch on missing session does not throw", async () => {
    const store = createRedisSessionStore({ client: createMockRedisClient() });
    await store.touch("non-existent", 3600);
  });

  test("keyPrefix prepends to stored keys", async () => {
    const client = createMockRedisClient();
    const store = createRedisSessionStore({ client, keyPrefix: "app:session:" });
    await store.set({
      id: "prefixed",
      data: { key: "value" },
      expiresAt: Date.now() + 60000,
    });
    expect(await store.get("prefixed")).not.toBeNull();
    expect(await client.get("app:session:prefixed")).not.toBeNull();
    expect(await client.get("session:prefixed")).toBeNull();
  });

  test("keyPrefix: all operations respect prefix", async () => {
    const client = createMockRedisClient();
    const store = createRedisSessionStore({ client, keyPrefix: "app:" });

    await store.set({ id: "s1", data: {}, expiresAt: Date.now() + 60000 });
    expect(await store.get("s1")).not.toBeNull();

    await store.touch("s1", 3600);
    expect(await store.get("s1")).not.toBeNull();

    await store.delete("s1");
    expect(await store.get("s1")).toBeNull();
  });
});

describe("createRedisSessionStore + createSessionManager integration", () => {
  function setup(options = {}) {
    const store = createRedisSessionStore({ client: createMockRedisClient() });
    const { createSessionManager } = require("../session");
    const manager = createSessionManager(store, options);
    return { store, manager };
  }

  test("full session lifecycle", async () => {
    const { manager } = setup({ ttl: 3600 });

    const session = await manager.create({ userId: "u1", role: "admin" });
    expect(session.data.userId).toBe("u1");

    const retrieved = await manager.get(session.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.data.role).toBe("admin");

    await manager.update(session.id, { lastActive: "now" });
    const updated = await manager.get(session.id);
    expect(updated!.data.lastActive).toBe("now");

    await manager.touch(session.id);
    const touched = await manager.get(session.id);
    expect(touched).not.toBeNull();

    await manager.destroy(session.id);
    expect(await manager.get(session.id)).toBeNull();
  });

  test("TTL expiration works end-to-end", async () => {
    const { manager } = setup({ ttl: 1 });
    const session = await manager.create({ userId: "u1" });

    await Bun.sleep(1100);
    const result = await manager.get(session.id);
    expect(result).toBeNull();
  });
});

describe("createRedisSessionStore deleteByUser", () => {
  test("deleteByUser removes all sessions for a user", async () => {
    const mockClient = createMockRedisClient();
    const store = createRedisSessionStore({ client: mockClient });

    // Create sessions for user1
    await store.set({ id: "s1", data: { userId: "user1" }, expiresAt: Date.now() + 60000 });
    await store.set({ id: "s2", data: { userId: "user1" }, expiresAt: Date.now() + 60000 });
    // Create session for user2
    await store.set({ id: "s3", data: { userId: "user2" }, expiresAt: Date.now() + 60000 });

    const count = await store.deleteByUser!("user1");
    expect(count).toBe(2);

    // user1 sessions should be gone
    expect(await store.get("s1")).toBeNull();
    expect(await store.get("s2")).toBeNull();

    // user2 session should still exist
    expect(await store.get("s3")).not.toBeNull();
  });

  test("deleteByUser for non-existent user returns 0", async () => {
    const mockClient = createMockRedisClient();
    const store = createRedisSessionStore({ client: mockClient });

    const count = await store.deleteByUser!("nonexistent");
    expect(count).toBe(0);
  });

  test("deleteByUser cleans up user set key", async () => {
    const mockClient = createMockRedisClient();
    const store = createRedisSessionStore({ client: mockClient });

    await store.set({ id: "s1", data: { userId: "user1" }, expiresAt: Date.now() + 60000 });

    await store.deleteByUser!("user1");

    // The user set key should also be deleted
    const members = await mockClient.smembers!("session:user:user1");
    expect(members).toEqual([]);
  });

  test("set tracks userId index via sadd", async () => {
    const mockClient = createMockRedisClient();
    const store = createRedisSessionStore({ client: mockClient });

    await store.set({ id: "s1", data: { userId: "user1" }, expiresAt: Date.now() + 60000 });

    const members = await mockClient.smembers!("session:user:user1");
    expect(members).toContain("s1");
  });

  test("delete removes session from user index via srem", async () => {
    const mockClient = createMockRedisClient();
    const store = createRedisSessionStore({ client: mockClient });

    await store.set({ id: "s1", data: { userId: "user1" }, expiresAt: Date.now() + 60000 });
    await store.delete("s1");

    const members = await mockClient.smembers!("session:user:user1");
    expect(members).not.toContain("s1");
  });
});

describe("distributed destroyByUser across independent SessionManager instances", () => {
  // Simulates two server instances sharing the same Redis backend.
  // Instance A creates sessions; instance B (with no local memory index) destroys them.

  test("instance B can destroy sessions created by instance A", async () => {
    const { createSessionManager } = require("../session");

    // Both instances share the same Redis client (i.e. the same Redis)
    const sharedRedisClient = createMockRedisClient();

    // Instance A: creates sessions
    const storeA = createRedisSessionStore({ client: sharedRedisClient });
    const managerA = createSessionManager(storeA, { ttl: 3600 });

    const s1 = await managerA.create({ userId: "user-x" });
    const s2 = await managerA.create({ userId: "user-x" });
    const s3 = await managerA.create({ userId: "other-user" });

    // Instance B: a completely independent manager with its own local state
    const storeB = createRedisSessionStore({ client: sharedRedisClient });
    const managerB = createSessionManager(storeB, { ttl: 3600 });

    // managerB has never seen user-x's sessions in its local memory, but
    // destroyByUser should still work because it delegates to the Redis store.
    const count = await managerB.destroyByUser("user-x");
    expect(count).toBe(2);

    // user-x sessions are gone
    expect(await managerA.get(s1.id)).toBeNull();
    expect(await managerA.get(s2.id)).toBeNull();

    // other-user session survives
    expect(await managerA.get(s3.id)).not.toBeNull();
  });

  test("instance B destroyByUser returns 0 for unknown user", async () => {
    const { createSessionManager } = require("../session");

    const sharedRedisClient = createMockRedisClient();
    const storeB = createRedisSessionStore({ client: sharedRedisClient });
    const managerB = createSessionManager(storeB, { ttl: 3600 });

    const count = await managerB.destroyByUser("never-existed");
    expect(count).toBe(0);
  });
});

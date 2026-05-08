import { describe, expect, test } from "bun:test";
import {
  createMemoryRevocationStore,
  createRedisRevocationStore,
} from "../token-revocation-store";
import type { RedisRevocationClientLike } from "../token-revocation-store";

describe("createMemoryRevocationStore", () => {
  test("add and has return true for valid entry", async () => {
    const store = createMemoryRevocationStore();
    await store.add("jti-1", 60000);
    expect(await store.has("jti-1")).toBe(true);
  });

  test("has returns false for unknown jti", async () => {
    const store = createMemoryRevocationStore();
    expect(await store.has("unknown")).toBe(false);
  });

  test("expired entry returns false from has", async () => {
    const store = createMemoryRevocationStore();
    await store.add("jti-expired", 1);
    await Bun.sleep(10);
    expect(await store.has("jti-expired")).toBe(false);
  });

  test("multiple entries are tracked independently", async () => {
    const store = createMemoryRevocationStore();
    await store.add("jti-a", 60000);
    await store.add("jti-b", 1);
    await Bun.sleep(10);
    expect(await store.has("jti-a")).toBe(true);
    expect(await store.has("jti-b")).toBe(false);
  });
});

describe("createRedisRevocationStore", () => {
  function createMockRedisClient(): {
    client: RedisRevocationClientLike;
    store: Map<string, string>;
  } {
    const store = new Map<string, string>();
    const client: RedisRevocationClientLike = {
      async set(key: string, value: string): Promise<"OK"> {
        store.set(key, value);
        return "OK";
      },
      async pexpire(_key: string, _milliseconds: number): Promise<number> {
        return 1;
      },
      async exists(key: string): Promise<boolean> {
        return store.has(key);
      },
    };
    return { client, store };
  }

  test("add and has return true for valid entry", async () => {
    const { client } = createMockRedisClient();
    const store = createRedisRevocationStore(client);
    await store.add("jti-1", 60000);
    expect(await store.has("jti-1")).toBe(true);
  });

  test("has returns false for unknown jti", async () => {
    const { client } = createMockRedisClient();
    const store = createRedisRevocationStore(client);
    expect(await store.has("unknown")).toBe(false);
  });

  test("uses default prefix token_revocation:", async () => {
    const { client, store } = createMockRedisClient();
    const revStore = createRedisRevocationStore(client);
    await revStore.add("jti-test", 60000);
    expect(store.has("token_revocation:jti-test")).toBe(true);
  });

  test("uses custom prefix", async () => {
    const { client, store } = createMockRedisClient();
    const revStore = createRedisRevocationStore(client, "my_prefix:");
    await revStore.add("jti-test", 60000);
    expect(store.has("my_prefix:jti-test")).toBe(true);
  });

  test("negative: missing key returns false", async () => {
    const { client } = createMockRedisClient();
    const store = createRedisRevocationStore(client);
    await store.add("jti-1", 60000);
    expect(await store.has("jti-2")).toBe(false);
  });
});

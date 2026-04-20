import { describe, test, expect } from "bun:test";
import { jitterTTL, withJitter } from "../jitter";
import type { CacheAdapter } from "../cache";

describe("jitterTTL", () => {
  test("returns value within jitter range", () => {
    const base = 100;
    for (let i = 0; i < 100; i++) {
      const result = jitterTTL(base, 0.1);
      expect(result).toBeGreaterThanOrEqual(90);
      expect(result).toBeLessThanOrEqual(110);
    }
  });

  test("returns at least 1 for small TTL", () => {
    const result = jitterTTL(1, 0.5);
    expect(result).toBeGreaterThanOrEqual(1);
  });

  test("returns 0 for 0 TTL", () => {
    expect(jitterTTL(0)).toBe(0);
  });

  test("returns negative for negative TTL", () => {
    expect(jitterTTL(-1)).toBe(-1);
  });

  test("no jitter with 0 percent", () => {
    expect(jitterTTL(100, 0)).toBe(100);
  });
});

describe("withJitter", () => {
  test("wraps adapter with jittered TTL", async () => {
    let capturedTTL: number | undefined;
    const mockAdapter: CacheAdapter = {
      async get() { return null; },
      async set(_key, _val, ttl) { capturedTTL = ttl; },
      async del() {},
      async has() { return false; },
      async flush() {},
      async keys() { return []; },
    };

    const jittered = withJitter(mockAdapter, { jitterPercent: 0.1 });
    await jittered.set("key", "value", 100);
    expect(capturedTTL).toBeDefined();
    expect(capturedTTL!).toBeGreaterThanOrEqual(90);
    expect(capturedTTL!).toBeLessThanOrEqual(110);
  });

  test("passes through get/del/has/flush/keys", async () => {
    const calls: string[] = [];
    const mockAdapter: CacheAdapter = {
      async get(key) { calls.push("get"); return "val"; },
      async set() { calls.push("set"); },
      async del() { calls.push("del"); },
      async has() { calls.push("has"); return true; },
      async flush() { calls.push("flush"); },
      async keys() { calls.push("keys"); return []; },
    };

    const jittered = withJitter(mockAdapter);
    await jittered.get("k");
    await jittered.del("k");
    await jittered.has("k");
    await jittered.flush();
    await jittered.keys("*");
    expect(calls).toEqual(["get", "del", "has", "flush", "keys"]);
  });

  test("no jitter when no TTL", async () => {
    let capturedTTL: number | undefined = 999;
    const mockAdapter: CacheAdapter = {
      async get() { return null; },
      async set(_key, _val, ttl) { capturedTTL = ttl; },
      async del() {},
      async has() { return false; },
      async flush() {},
      async keys() { return []; },
    };

    const jittered = withJitter(mockAdapter);
    await jittered.set("key", "value");
    expect(capturedTTL).toBeUndefined();
  });
});

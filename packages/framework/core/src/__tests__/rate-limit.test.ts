import { describe, expect, test } from "bun:test";
import { createContext } from "../context";
import {
  createMemoryRateLimitStore,
  createRedisRateLimitStore,
  rateLimit,
} from "../middlewares/rate-limit";
import type { RedisClientLike } from "../middlewares/rate-limit";

function makeCtx(ip = "127.0.0.1") {
  const request = new Request("http://localhost/api/test", {
    headers: { "x-forwarded-for": ip },
  });
  return createContext(request);
}

const okHandler = (ctx: ReturnType<typeof createContext>) => () =>
  Promise.resolve(ctx.json({ ok: true }));

describe("rateLimit", () => {
  test("allows requests under limit", async () => {
    const mw = rateLimit({ max: 5, windowMs: 60_000, trustProxyHeaders: true });
    const ctx = makeCtx();
    const response = await mw(ctx, okHandler(ctx));
    expect(response.status).toBe(200);
    expect(response.headers.get("X-RateLimit-Limit")).toBe("5");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("4");
    expect(response.headers.has("X-RateLimit-Reset")).toBe(true);
  });

  test("returns 429 when exceeding limit", async () => {
    const store = createMemoryRateLimitStore();
    const mw = rateLimit({ max: 2, windowMs: 60_000, store, trustProxyHeaders: true });

    for (let i = 0; i < 2; i++) {
      const ctx = makeCtx();
      await mw(ctx, okHandler(ctx));
    }

    const ctx = makeCtx();
    const response = await mw(ctx, okHandler(ctx));
    expect(response.status).toBe(429);
    expect(response.headers.has("Retry-After")).toBe(true);
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    const body = await response.json();
    expect(body.error).toBe("请求过于频繁");
  });

  test("custom message on 429", async () => {
    const store = createMemoryRateLimitStore();
    const mw = rateLimit({ max: 1, windowMs: 60_000, store, message: "Slow down", trustProxyHeaders: true });

    const ctx1 = makeCtx();
    await mw(ctx1, okHandler(ctx1));

    const ctx2 = makeCtx();
    const response = await mw(ctx2, okHandler(ctx2));
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toBe("Slow down");
  });

  test("different keys are independent", async () => {
    const store = createMemoryRateLimitStore();
    const mw = rateLimit({ max: 1, windowMs: 60_000, store, trustProxyHeaders: true });

    const ctx1 = makeCtx("1.1.1.1");
    const res1 = await mw(ctx1, okHandler(ctx1));
    expect(res1.status).toBe(200);

    const ctx2 = makeCtx("2.2.2.2");
    const res2 = await mw(ctx2, okHandler(ctx2));
    expect(res2.status).toBe(200);
  });

  test("custom keyFn", async () => {
    const store = createMemoryRateLimitStore();
    const mw = rateLimit({
      max: 1,
      windowMs: 60_000,
      store,
      keyFn: () => "global",
    });

    const ctx1 = makeCtx("1.1.1.1");
    await mw(ctx1, okHandler(ctx1));

    const ctx2 = makeCtx("2.2.2.2");
    const res = await mw(ctx2, okHandler(ctx2));
    expect(res.status).toBe(429);
  });

  test("window resets after expiry", async () => {
    const store = createMemoryRateLimitStore();
    const mw = rateLimit({ max: 1, windowMs: 50, store, trustProxyHeaders: true });

    const ctx1 = makeCtx();
    await mw(ctx1, okHandler(ctx1));

    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 60));

    const ctx2 = makeCtx();
    const res = await mw(ctx2, okHandler(ctx2));
    expect(res.status).toBe(200);
  });

  test("store reset clears entry", async () => {
    const store = createMemoryRateLimitStore();
    const mw = rateLimit({ max: 1, windowMs: 60_000, store, trustProxyHeaders: true });

    const ctx1 = makeCtx();
    await mw(ctx1, okHandler(ctx1));

    await store.reset("127.0.0.1");

    const ctx2 = makeCtx();
    const res = await mw(ctx2, okHandler(ctx2));
    expect(res.status).toBe(200);
  });

  test("spoofed proxy headers do not create independent buckets by default", async () => {
    const store = createMemoryRateLimitStore();
    const mw = rateLimit({ max: 1, windowMs: 60_000, store });

    const ctx1 = makeCtx("1.1.1.1");
    const res1 = await mw(ctx1, okHandler(ctx1));
    expect(res1.status).toBe(200);

    const ctx2 = makeCtx("2.2.2.2");
    const res2 = await mw(ctx2, okHandler(ctx2));
    expect(res2.status).toBe(429);
  });
});

describe("createRedisRateLimitStore", () => {
  function createMockRedisClient(): RedisClientLike & { data: Map<string, { value: number; resetAt: number }> } {
    const data = new Map<string, { value: number; resetAt: number }>();

    return {
      data,
      async incr(key: string) {
        const existing = data.get(key);
        if (!existing) {
          data.set(key, { value: 1, resetAt: Date.now() + 60_000 });
          return 1;
        }
        existing.value++;
        return existing.value;
      },
      async pexpire(key: string, ms: number) {
        const entry = data.get(key);
        if (entry) {
          entry.resetAt = Date.now() + ms;
        }
      },
      async pttl(key: string) {
        const entry = data.get(key);
        if (!entry) return -2;
        const ttl = entry.resetAt - Date.now();
        return ttl > 0 ? ttl : -2;
      },
      async del(key: string) {
        data.delete(key);
      },
    };
  }

  test("increments count and sets expiry on first call", async () => {
    const client = createMockRedisClient();
    const store = createRedisRateLimitStore({ client, keyPrefix: "rl:" });

    const result = await store.increment("ip-1", 60_000);
    expect(result.count).toBe(1);
    expect(result.resetAt).toBeGreaterThan(Date.now());

    // Verify key prefix is applied
    expect(client.data.has("rl:ip-1")).toBe(true);
  });

  test("increments count on subsequent calls", async () => {
    const client = createMockRedisClient();
    const store = createRedisRateLimitStore({ client });

    await store.increment("ip-2", 60_000);
    const result = await store.increment("ip-2", 60_000);
    expect(result.count).toBe(2);
  });

  test("reset deletes the key", async () => {
    const client = createMockRedisClient();
    const store = createRedisRateLimitStore({ client });

    await store.increment("ip-3", 60_000);
    await store.reset("ip-3");

    expect(client.data.has("ratelimit:ip-3")).toBe(false);
  });

  test("works with rateLimit middleware", async () => {
    const client = createMockRedisClient();
    const store = createRedisRateLimitStore({ client });
    const mw = rateLimit({ max: 2, windowMs: 60_000, store, trustProxyHeaders: true });

    for (let i = 0; i < 2; i++) {
      const ctx = makeCtx();
      const res = await mw(ctx, okHandler(ctx));
      expect(res.status).toBe(200);
    }

    const ctx = makeCtx();
    const res = await mw(ctx, okHandler(ctx));
    expect(res.status).toBe(429);
  });

  test("uses Lua script when client supports eval", async () => {
    let evalCalled = false;
    const client: RedisClientLike & { eval: typeof eval } = {
      async incr() { return 0; },
      async pexpire() {},
      async pttl() { return 0; },
      async del() {},
      async eval(script: string, keys: number, ...args: string[]) {
        evalCalled = true;
        expect(script).toContain("INCR");
        expect(script).toContain("PEXPIRE");
        expect(keys).toBe(1);
        expect(args[0]).toBe("ratelimit:test"); // key
        expect(args[1]).toBe("60000");           // windowMs
        return [3, 50_000] as unknown as [number, number];
      },
    };

    const store = createRedisRateLimitStore({ client });
    const result = await store.increment("test", 60_000);
    expect(evalCalled).toBe(true);
    expect(result.count).toBe(3);
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });
});

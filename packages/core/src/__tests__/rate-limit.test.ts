import { describe, test, expect } from "bun:test";
import { rateLimit, createMemoryRateLimitStore } from "../middlewares/rate-limit";
import { createContext } from "../context";

function makeCtx(ip = "127.0.0.1") {
  const request = new Request("http://localhost/api/test", {
    headers: { "x-forwarded-for": ip },
  });
  return createContext(request);
}

const okHandler = (ctx: ReturnType<typeof createContext>) =>
  () => Promise.resolve(ctx.json({ ok: true }));

describe("rateLimit", () => {
  test("allows requests under limit", async () => {
    const mw = rateLimit({ max: 5, windowMs: 60_000 });
    const ctx = makeCtx();
    const response = await mw(ctx, okHandler(ctx));
    expect(response.status).toBe(200);
    expect(response.headers.get("X-RateLimit-Limit")).toBe("5");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("4");
    expect(response.headers.has("X-RateLimit-Reset")).toBe(true);
  });

  test("returns 429 when exceeding limit", async () => {
    const store = createMemoryRateLimitStore();
    const mw = rateLimit({ max: 2, windowMs: 60_000, store });

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
    expect(body.error).toBe("Too Many Requests");
  });

  test("custom message on 429", async () => {
    const store = createMemoryRateLimitStore();
    const mw = rateLimit({ max: 1, windowMs: 60_000, store, message: "Slow down" });

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
    const mw = rateLimit({ max: 1, windowMs: 60_000, store });

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
    const mw = rateLimit({ max: 1, windowMs: 50, store });

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
    const mw = rateLimit({ max: 1, windowMs: 60_000, store });

    const ctx1 = makeCtx();
    await mw(ctx1, okHandler(ctx1));

    await store.reset("127.0.0.1");

    const ctx2 = makeCtx();
    const res = await mw(ctx2, okHandler(ctx2));
    expect(res.status).toBe(200);
  });
});

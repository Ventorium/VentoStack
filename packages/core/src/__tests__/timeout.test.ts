import { describe, test, expect } from "bun:test";
import { timeout } from "../middlewares/timeout";
import { createContext } from "../context";

function makeCtx() {
  return createContext(new Request("http://localhost/"));
}

describe("timeout", () => {
  test("passes through when handler completes in time", async () => {
    const mw = timeout({ ms: 1000 });
    const ctx = makeCtx();
    const response = await mw(ctx, () => Promise.resolve(ctx.json({ ok: true })));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("returns 408 when handler exceeds timeout", async () => {
    const mw = timeout({ ms: 50 });
    const ctx = makeCtx();
    const response = await mw(ctx, () =>
      new Promise((resolve) => setTimeout(() => resolve(ctx.json({ ok: true })), 200)),
    );
    expect(response.status).toBe(408);
    const body = await response.json();
    expect(body.error).toBe("Request Timeout");
  });

  test("custom timeout message", async () => {
    const mw = timeout({ ms: 50, message: "Too slow" });
    const ctx = makeCtx();
    const response = await mw(ctx, () =>
      new Promise((resolve) => setTimeout(() => resolve(ctx.json({ ok: true })), 200)),
    );
    expect(response.status).toBe(408);
    const body = await response.json();
    expect(body.error).toBe("Too slow");
  });

  test("re-throws non-timeout errors", async () => {
    const mw = timeout({ ms: 1000 });
    const ctx = makeCtx();
    await expect(
      mw(ctx, () => Promise.reject(new Error("handler error"))),
    ).rejects.toThrow("handler error");
  });

  test("uses default 30s timeout", () => {
    // just verify it creates without error with defaults
    const mw = timeout();
    expect(typeof mw).toBe("function");
  });
});

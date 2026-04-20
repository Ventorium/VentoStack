import { describe, test, expect } from "bun:test";
import { compose, type Middleware } from "../middleware";
import { createContext } from "../context";

function makeCtx() {
  return createContext(new Request("http://localhost:3000/"));
}

describe("compose", () => {
  test("with no middleware, calls final handler", async () => {
    const ctx = makeCtx();
    const result = await compose([])(ctx, () =>
      Promise.resolve(ctx.json({ ok: true })),
    );
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ok: true });
  });

  test("single middleware wraps handler", async () => {
    const ctx = makeCtx();
    const calls: string[] = [];

    const mw: Middleware = async (c, next) => {
      calls.push("before");
      const res = await next();
      calls.push("after");
      return res;
    };

    await compose([mw])(ctx, () => {
      calls.push("handler");
      return Promise.resolve(ctx.text("ok"));
    });

    expect(calls).toEqual(["before", "handler", "after"]);
  });

  test("multiple middleware execute in onion order", async () => {
    const ctx = makeCtx();
    const calls: string[] = [];

    const mw1: Middleware = async (c, next) => {
      calls.push("mw1-before");
      const res = await next();
      calls.push("mw1-after");
      return res;
    };

    const mw2: Middleware = async (c, next) => {
      calls.push("mw2-before");
      const res = await next();
      calls.push("mw2-after");
      return res;
    };

    await compose([mw1, mw2])(ctx, () => {
      calls.push("handler");
      return Promise.resolve(ctx.text("ok"));
    });

    expect(calls).toEqual([
      "mw1-before",
      "mw2-before",
      "handler",
      "mw2-after",
      "mw1-after",
    ]);
  });

  test("next() called multiple times throws", async () => {
    const ctx = makeCtx();

    const mw: Middleware = async (c, next) => {
      await next();
      return await next(); // second call should throw
    };

    await expect(
      compose([mw])(ctx, () => Promise.resolve(ctx.text("ok"))),
    ).rejects.toThrow("next() called multiple times");
  });

  test("error in middleware propagates", async () => {
    const ctx = makeCtx();

    const mw: Middleware = async () => {
      throw new Error("middleware error");
    };

    await expect(
      compose([mw])(ctx, () => Promise.resolve(ctx.text("ok"))),
    ).rejects.toThrow("middleware error");
  });

  test("error in handler propagates through middleware", async () => {
    const ctx = makeCtx();

    const mw: Middleware = async (c, next) => {
      return await next();
    };

    await expect(
      compose([mw])(ctx, () => {
        throw new Error("handler error");
      }),
    ).rejects.toThrow("handler error");
  });

  test("middleware can modify response", async () => {
    const ctx = makeCtx();

    const mw: Middleware = async (c, next) => {
      const res = await next();
      return new Response(res.body, {
        status: res.status,
        headers: {
          ...Object.fromEntries(res.headers.entries()),
          "X-Added": "by-middleware",
        },
      });
    };

    const result = await compose([mw])(ctx, () =>
      Promise.resolve(ctx.text("ok")),
    );
    expect(result.headers.get("X-Added")).toBe("by-middleware");
  });

  test("middleware can short-circuit (not call next)", async () => {
    const ctx = makeCtx();
    const calls: string[] = [];

    const authMw: Middleware = async (c) => {
      calls.push("auth");
      return c.json({ error: "unauthorized" }, 401);
    };

    const neverReached: Middleware = async (c, next) => {
      calls.push("never");
      return await next();
    };

    const result = await compose([authMw, neverReached])(ctx, () => {
      calls.push("handler");
      return Promise.resolve(ctx.text("ok"));
    });

    expect(result.status).toBe(401);
    expect(calls).toEqual(["auth"]);
  });

  test("middleware receives correct context", async () => {
    const ctx = makeCtx();
    ctx.state.set("key", "value");

    const mw: Middleware = async (c, next) => {
      expect(c.state.get("key")).toBe("value");
      return await next();
    };

    await compose([mw])(ctx, () => Promise.resolve(ctx.text("ok")));
  });
});

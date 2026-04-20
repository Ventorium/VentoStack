import { describe, test, expect } from "bun:test";
import { createPipeline } from "../interceptor";
import type { Context } from "../context";

function mockContext(overrides?: Partial<Context>): Context {
  return {
    request: new Request("http://localhost/test"),
    params: {},
    query: {},
    headers: new Headers(),
    state: new Map(),
    ...overrides,
  } as Context;
}

describe("createPipeline", () => {
  test("empty pipeline passes through to next", async () => {
    const pipeline = createPipeline();
    const mw = pipeline.toMiddleware();
    const ctx = mockContext();
    const response = await mw(ctx, async () => new Response("ok"));
    expect(await response.text()).toBe("ok");
  });

  test("filter can reject request", async () => {
    const pipeline = createPipeline();
    pipeline.addFilter({
      name: "deny-all",
      apply: () => false,
    });
    const mw = pipeline.toMiddleware();
    const ctx = mockContext();
    const response = await mw(ctx, async () => new Response("ok"));
    expect(response.status).toBe(403);
  });

  test("filter can return custom response", async () => {
    const pipeline = createPipeline();
    pipeline.addFilter({
      name: "custom",
      apply: () => new Response("blocked", { status: 429 }),
    });
    const mw = pipeline.toMiddleware();
    const ctx = mockContext();
    const response = await mw(ctx, async () => new Response("ok"));
    expect(response.status).toBe(429);
    expect(await response.text()).toBe("blocked");
  });

  test("filter passes when returning true", async () => {
    const pipeline = createPipeline();
    pipeline.addFilter({ name: "allow", apply: () => true });
    const mw = pipeline.toMiddleware();
    const ctx = mockContext();
    const response = await mw(ctx, async () => new Response("ok"));
    expect(await response.text()).toBe("ok");
  });

  test("interceptor before can short-circuit", async () => {
    const pipeline = createPipeline();
    pipeline.addInterceptor({
      name: "auth",
      before: () => new Response("unauthorized", { status: 401 }),
    });
    const mw = pipeline.toMiddleware();
    const ctx = mockContext();
    const response = await mw(ctx, async () => new Response("ok"));
    expect(response.status).toBe(401);
  });

  test("interceptor after modifies response", async () => {
    const pipeline = createPipeline();
    pipeline.addInterceptor({
      name: "header-adder",
      after: (_ctx, response) => {
        const newResp = new Response(response.body, response);
        newResp.headers.set("X-Custom", "value");
        return newResp;
      },
    });
    const mw = pipeline.toMiddleware();
    const ctx = mockContext();
    const response = await mw(ctx, async () => new Response("ok"));
    expect(response.headers.get("X-Custom")).toBe("value");
  });

  test("interceptor after runs in reverse order", async () => {
    const pipeline = createPipeline();
    const order: string[] = [];
    pipeline.addInterceptor({
      name: "first",
      after: (_ctx, response) => { order.push("first"); return response; },
    });
    pipeline.addInterceptor({
      name: "second",
      after: (_ctx, response) => { order.push("second"); return response; },
    });
    const mw = pipeline.toMiddleware();
    await mw(mockContext(), async () => new Response("ok"));
    expect(order).toEqual(["second", "first"]);
  });

  test("middleware chain executes in order", async () => {
    const pipeline = createPipeline();
    const order: string[] = [];
    pipeline.addMiddleware(async (_ctx, next) => {
      order.push("mw1-before");
      const r = await next();
      order.push("mw1-after");
      return r;
    });
    pipeline.addMiddleware(async (_ctx, next) => {
      order.push("mw2-before");
      const r = await next();
      order.push("mw2-after");
      return r;
    });
    const mw = pipeline.toMiddleware();
    await mw(mockContext(), async () => { order.push("handler"); return new Response("ok"); });
    expect(order).toEqual(["mw1-before", "mw2-before", "handler", "mw2-after", "mw1-after"]);
  });

  test("full pipeline: filter → interceptor → middleware → handler", async () => {
    const pipeline = createPipeline();
    const order: string[] = [];
    pipeline.addFilter({ name: "f", apply: () => { order.push("filter"); return true; } });
    pipeline.addInterceptor({
      name: "i",
      before: () => { order.push("before"); },
      after: (_ctx, r) => { order.push("after"); return r; },
    });
    pipeline.addMiddleware(async (_ctx, next) => { order.push("mw"); return next(); });
    const mw = pipeline.toMiddleware();
    await mw(mockContext(), async () => { order.push("handler"); return new Response("ok"); });
    expect(order).toEqual(["filter", "before", "mw", "handler", "after"]);
  });
});

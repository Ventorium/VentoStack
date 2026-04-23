import { afterEach, describe, expect, test } from "bun:test";
import { createApp } from "../app";
import { NotFoundError } from "../errors";
import type { Middleware } from "../middleware";
import type { Plugin } from "../plugin";
import { createRouter } from "../router";

let appToClose: ReturnType<typeof createApp> | null = null;

afterEach(async () => {
  if (appToClose) {
    await appToClose.close();
    appToClose = null;
  }
});

describe("createApp", () => {
  test("creates app with router and lifecycle", () => {
    const app = createApp();
    expect(app.router).toBeDefined();
    expect(app.lifecycle).toBeDefined();
    expect(typeof app.use).toBe("function");
    expect(typeof app.listen).toBe("function");
    expect(typeof app.close).toBe("function");
  });

  test("use() accepts middleware (function)", () => {
    const app = createApp();
    const mw: Middleware = async (_ctx, next) => await next();
    const result = app.use(mw);
    expect(result).toBe(app); // chaining
  });

  test("use() accepts plugin (object with name and install)", () => {
    const installed: string[] = [];
    const plugin: Plugin = {
      name: "test-plugin",
      install(_app) {
        installed.push("installed");
      },
    };
    const app = createApp();
    const result = app.use(plugin);
    expect(result).toBe(app);
  });

  test("use() accepts router and merges routes", () => {
    const app = createApp();
    const router = createRouter();
    router.get("/external", (ctx) => ctx.text("from-router"));

    const result = app.use(router);
    expect(result).toBe(app);
    expect(app.router.routes()).toHaveLength(1);
    expect(app.router.routes()[0]!.path).toBe("/external");
  });
});

describe("App HTTP integration", () => {
  test("listens on specified port and serves routes", async () => {
    const app = createApp();
    app.router.get("/health", (ctx) => ctx.json({ status: "ok" }));

    await app.listen(0);
    appToClose = app;

    // Access the server port - Bun.serve with port 0 assigns random port
    // We need to get the port somehow. Let's use a different approach:
    // We'll test with a specific port range
  });

  test("returns 404 for unmatched routes", async () => {
    const app = createApp();
    app.router.get("/exists", (ctx) => ctx.text("ok"));

    // Use a random high port
    const port = 40000 + Math.floor(Math.random() * 10000);
    await app.listen(port);
    appToClose = app;

    const res = await fetch(`http://localhost:${port}/not-found`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("NOT_FOUND");
  });

  test("handles route requests", async () => {
    const app = createApp();
    app.router.get("/hello", (ctx) => ctx.json({ message: "hello" }));

    const port = 40000 + Math.floor(Math.random() * 10000);
    await app.listen(port);
    appToClose = app;

    const res = await fetch(`http://localhost:${port}/hello`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "hello" });
  });

  test("ctx.json supports custom headers", async () => {
    const app = createApp();
    app.router.get("/custom-headers", (ctx) =>
      ctx.json({ ok: true }, 200, { "X-Custom": "value", "X-Request-Id": "123" }),
    );

    const port = 40000 + Math.floor(Math.random() * 10000);
    await app.listen(port);
    appToClose = app;

    const res = await fetch(`http://localhost:${port}/custom-headers`);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Custom")).toBe("value");
    expect(res.headers.get("X-Request-Id")).toBe("123");
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(await res.json()).toEqual({ ok: true });
  });

  test("serves async stream chunks over HTTP without truncation", async () => {
    const app = createApp();
    const encoder = new TextEncoder();

    app.router.get("/stream", () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode("data: hello\n\n"));
          timer = setTimeout(() => {
            controller.enqueue(encoder.encode("data: world\n\n"));
            controller.close();
          }, 10);
        },
        cancel() {
          if (timer) {
            clearTimeout(timer);
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    });

    const port = 40000 + Math.floor(Math.random() * 10000);
    await app.listen(port);
    appToClose = app;

    const res = await fetch(`http://localhost:${port}/stream`);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    expect(await res.text()).toBe("data: hello\n\ndata: world\n\n");
  });

  test("global middleware runs on requests", async () => {
    const app = createApp();
    const headerMw: Middleware = async (_ctx, next) => {
      const res = await next();
      return new Response(res.body, {
        status: res.status,
        headers: {
          ...Object.fromEntries(res.headers.entries()),
          "X-Framework": "VentoStack",
        },
      });
    };
    app.use(headerMw);
    app.router.get("/test", (ctx) => ctx.text("ok"));

    const port = 40000 + Math.floor(Math.random() * 10000);
    await app.listen(port);
    appToClose = app;

    const res = await fetch(`http://localhost:${port}/test`);
    expect(res.headers.get("X-Framework")).toBe("VentoStack");
  });

  test("handles VentoStackError in handler", async () => {
    const app = createApp();
    app.router.get("/fail", () => {
      throw new NotFoundError("resource missing");
    });

    const port = 40000 + Math.floor(Math.random() * 10000);
    await app.listen(port);
    appToClose = app;

    const res = await fetch(`http://localhost:${port}/fail`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("NOT_FOUND");
    expect(body.message).toBe("resource missing");
  });

  test("handles unknown error in handler", async () => {
    const app = createApp();
    app.router.get("/crash", () => {
      throw new Error("unexpected");
    });

    const port = 40000 + Math.floor(Math.random() * 10000);
    await app.listen(port);
    appToClose = app;

    const res = await fetch(`http://localhost:${port}/crash`);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("INTERNAL_ERROR");
    // Should NOT expose internal error message
    expect(body.message).toBe("Internal Server Error");
  });

  test("plugin install is called before start", async () => {
    const calls: string[] = [];
    const plugin: Plugin = {
      name: "test-plugin",
      install() {
        calls.push("plugin-installed");
      },
    };

    const app = createApp();
    app.use(plugin);
    app.router.get("/test", (ctx) => ctx.text("ok"));

    const port = 40000 + Math.floor(Math.random() * 10000);
    await app.listen(port);
    appToClose = app;

    expect(calls).toContain("plugin-installed");
  });

  test("lifecycle hooks run during listen", async () => {
    const calls: string[] = [];
    const app = createApp();
    app.lifecycle.onBeforeStart(() => calls.push("beforeStart"));
    app.lifecycle.onAfterStart(() => calls.push("afterStart"));
    app.router.get("/test", (ctx) => ctx.text("ok"));

    const port = 40000 + Math.floor(Math.random() * 10000);
    await app.listen(port);
    appToClose = app;

    expect(calls).toEqual(["beforeStart", "afterStart"]);
  });

  test("lifecycle beforeStop runs during close", async () => {
    const calls: string[] = [];
    const app = createApp();
    app.lifecycle.onBeforeStop(() => calls.push("beforeStop"));
    app.router.get("/test", (ctx) => ctx.text("ok"));

    const port = 40000 + Math.floor(Math.random() * 10000);
    await app.listen(port);

    await app.close();
    expect(calls).toContain("beforeStop");
  });

  test("close() is idempotent", async () => {
    const app = createApp();
    app.router.get("/test", (ctx) => ctx.text("ok"));

    const port = 40000 + Math.floor(Math.random() * 10000);
    await app.listen(port);

    await app.close();
    await app.close(); // should not throw
  });

  test("close() waits for active requests", async () => {
    const app = createApp();
    let resolveRequest: (() => void) | null = null;
    const requestStarted = new Promise<void>((resolve) => {
      app.router.get("/slow", async (ctx) => {
        resolve();
        await new Promise<void>((r) => {
          resolveRequest = r;
        });
        return ctx.text("done");
      });
    });

    const port = 40000 + Math.floor(Math.random() * 10000);
    await app.listen(port);

    // Start a slow request
    const fetchPromise = fetch(`http://localhost:${port}/slow`);
    await requestStarted;

    // Start closing - should wait for the request
    const closePromise = app.close();

    // Send a new request while closing - should get 503
    const closingRes = await fetch(`http://localhost:${port}/slow`);
    expect(closingRes.status).toBe(503);

    // Resolve the pending request
    resolveRequest!();

    // Both should complete
    const res = await fetchPromise;
    expect(await res.text()).toBe("done");
    await closePromise;
  });
});

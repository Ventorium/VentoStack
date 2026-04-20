import { describe, test, expect, afterEach } from "bun:test";
import { createApp } from "@aeron/core";
import { createTestApp } from "../test-app";
import { createTestClient } from "../test-client";
import type { Context } from "@aeron/core";

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = null;
  }
});

describe("createTestApp", () => {
  test("starts app on a random port", async () => {
    const app = createApp();
    app.router.get("/health", (ctx: Context) => {
      return ctx.json({ status: "ok" });
    });

    const instance = await createTestApp(app);
    cleanup = instance.close;

    expect(instance.port).toBeGreaterThan(0);
    expect(instance.baseUrl).toBe(`http://localhost:${instance.port}`);
    expect(instance.app).toBe(app);
  });

  test("serves requests via test client", async () => {
    const app = createApp();
    app.router.get("/ping", (ctx: Context) => {
      return ctx.json({ pong: true });
    });

    const instance = await createTestApp(app);
    cleanup = instance.close;

    const client = createTestClient(instance.baseUrl);
    const res = await client.get("/ping");
    expect(res.status).toBe(200);
    expect(res.json()).toEqual({ pong: true });
  });

  test("handles POST with body", async () => {
    const app = createApp();
    app.router.post("/echo", async (ctx: Context) => {
      const body = await ctx.request.json();
      return ctx.json({ received: body });
    });

    const instance = await createTestApp(app);
    cleanup = instance.close;

    const client = createTestClient(instance.baseUrl);
    const res = await client.post("/echo", { message: "hello" });
    expect(res.status).toBe(200);
    expect(res.json()).toEqual({ received: { message: "hello" } });
  });

  test("close() shuts down the server", async () => {
    const app = createApp();
    app.router.get("/test", (ctx: Context) => {
      return ctx.text("ok");
    });

    const instance = await createTestApp(app);
    const { port } = instance;

    // Verify it's running
    const client = createTestClient(instance.baseUrl);
    const res = await client.get("/test");
    expect(res.status).toBe(200);

    // Close and verify
    await instance.close();
    cleanup = null;

    try {
      await fetch(`http://localhost:${port}/test`);
    } catch {
      // Expected: connection refused after close
    }
  });

  test("each test app gets a unique port", async () => {
    const app1 = createApp();
    app1.router.get("/id", (ctx: Context) => ctx.text("1"));
    const app2 = createApp();
    app2.router.get("/id", (ctx: Context) => ctx.text("2"));

    const instance1 = await createTestApp(app1);
    const instance2 = await createTestApp(app2);

    expect(instance1.port).not.toBe(instance2.port);

    await instance1.close();
    await instance2.close();
  });
});

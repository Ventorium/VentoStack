import { describe, test, expect } from "bun:test";
import { cors } from "../middlewares/cors";
import { createContext } from "../context";
import type { Middleware } from "../middleware";

function makeCtx(method: string, headers?: Record<string, string>) {
  const h = new Headers(headers);
  const request = new Request("http://localhost/api/test", { method, headers: h });
  return createContext(request);
}

const okHandler = (ctx: ReturnType<typeof createContext>) =>
  () => Promise.resolve(ctx.json({ ok: true }));

describe("cors", () => {
  test("no origin header -> passes through without CORS headers", async () => {
    const mw = cors({ origin: "http://example.com" });
    const ctx = makeCtx("GET");
    const response = await mw(ctx, okHandler(ctx));
    expect(response.status).toBe(200);
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });

  test("default deny - no origin option rejects", async () => {
    const mw = cors();
    const ctx = makeCtx("GET", { origin: "http://evil.com" });
    const response = await mw(ctx, okHandler(ctx));
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });

  test("string origin match", async () => {
    const mw = cors({ origin: "http://example.com" });
    const ctx = makeCtx("GET", { origin: "http://example.com" });
    const response = await mw(ctx, okHandler(ctx));
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://example.com");
  });

  test("string origin mismatch", async () => {
    const mw = cors({ origin: "http://example.com" });
    const ctx = makeCtx("GET", { origin: "http://evil.com" });
    const response = await mw(ctx, okHandler(ctx));
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });

  test("array origin match", async () => {
    const mw = cors({ origin: ["http://a.com", "http://b.com"] });
    const ctx = makeCtx("GET", { origin: "http://b.com" });
    const response = await mw(ctx, okHandler(ctx));
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://b.com");
  });

  test("function origin match", async () => {
    const mw = cors({ origin: (o) => o.endsWith(".example.com") });
    const ctx = makeCtx("GET", { origin: "http://app.example.com" });
    const response = await mw(ctx, okHandler(ctx));
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://app.example.com");
  });

  test("function origin reject", async () => {
    const mw = cors({ origin: (o) => o.endsWith(".example.com") });
    const ctx = makeCtx("GET", { origin: "http://evil.com" });
    const response = await mw(ctx, okHandler(ctx));
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });

  test("OPTIONS preflight returns 204 with CORS headers", async () => {
    const mw = cors({
      origin: "http://example.com",
      methods: ["GET", "POST"],
      allowedHeaders: ["Content-Type"],
      maxAge: 3600,
    });
    const ctx = makeCtx("OPTIONS", { origin: "http://example.com" });
    const response = await mw(ctx, okHandler(ctx));
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://example.com");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST");
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
    expect(response.headers.get("Access-Control-Max-Age")).toBe("3600");
  });

  test("OPTIONS preflight reflects request headers if no allowedHeaders", async () => {
    const mw = cors({ origin: "http://example.com" });
    const ctx = makeCtx("OPTIONS", {
      origin: "http://example.com",
      "access-control-request-headers": "Authorization, Content-Type",
    });
    const response = await mw(ctx, okHandler(ctx));
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Authorization, Content-Type");
  });

  test("OPTIONS with disallowed origin returns 403", async () => {
    const mw = cors({ origin: "http://example.com" });
    const ctx = makeCtx("OPTIONS", { origin: "http://evil.com" });
    const response = await mw(ctx, okHandler(ctx));
    expect(response.status).toBe(403);
  });

  test("credentials header is set when enabled", async () => {
    const mw = cors({ origin: "http://example.com", credentials: true });
    const ctx = makeCtx("GET", { origin: "http://example.com" });
    const response = await mw(ctx, okHandler(ctx));
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  test("credentials + wildcard origin throws", () => {
    expect(() => cors({ origin: "*", credentials: true })).toThrow(
      "CORS credentials with wildcard origin is not allowed",
    );
  });

  test("exposed headers are set", async () => {
    const mw = cors({ origin: "http://example.com", exposedHeaders: ["X-Custom"] });
    const ctx = makeCtx("GET", { origin: "http://example.com" });
    const response = await mw(ctx, okHandler(ctx));
    expect(response.headers.get("Access-Control-Expose-Headers")).toBe("X-Custom");
  });
});

import { describe, test, expect } from "bun:test";
import { csrf } from "../middlewares/csrf";
import { createContext } from "../context";

function makeCtx(
  method: string,
  headers?: Record<string, string>,
) {
  const h = new Headers(headers);
  const request = new Request("http://localhost/api/test", { method, headers: h });
  return createContext(request);
}

const okHandler = () => Promise.resolve(new Response(JSON.stringify({ ok: true }), {
  status: 200,
  headers: { "Content-Type": "application/json" },
}));

describe("csrf", () => {
  test("safe methods (GET) pass through without token check", async () => {
    const mw = csrf();
    const ctx = makeCtx("GET");
    const response = await mw(ctx, okHandler);
    expect(response.status).toBe(200);
  });

  test("safe methods set cookie when no token exists", async () => {
    const mw = csrf();
    const ctx = makeCtx("GET");
    const response = await mw(ctx, okHandler);
    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain("_csrf=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
  });

  test("safe methods do not reset cookie when token exists", async () => {
    const mw = csrf();
    const ctx = makeCtx("GET", { cookie: "_csrf=existingtoken123" });
    const response = await mw(ctx, okHandler);
    expect(response.headers.has("Set-Cookie")).toBe(false);
  });

  test("HEAD and OPTIONS are safe methods", async () => {
    const mw = csrf();
    for (const method of ["HEAD", "OPTIONS"]) {
      const ctx = makeCtx(method);
      const response = await mw(ctx, okHandler);
      expect(response.status).toBe(200);
    }
  });

  test("POST without cookie token returns 403", async () => {
    const mw = csrf();
    const ctx = makeCtx("POST");
    const response = await mw(ctx, okHandler);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toContain("missing");
  });

  test("POST with cookie but no header token returns 403", async () => {
    const mw = csrf();
    const ctx = makeCtx("POST", { cookie: "_csrf=abc123" });
    const response = await mw(ctx, okHandler);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toContain("mismatch");
  });

  test("POST with mismatched tokens returns 403", async () => {
    const mw = csrf();
    const ctx = makeCtx("POST", {
      cookie: "_csrf=token_a",
      "x-csrf-token": "token_b",
    });
    const response = await mw(ctx, okHandler);
    expect(response.status).toBe(403);
  });

  test("POST with matching tokens passes through", async () => {
    const mw = csrf();
    const token = "abcdef1234567890abcdef1234567890";
    const ctx = makeCtx("POST", {
      cookie: `_csrf=${token}`,
      "x-csrf-token": token,
    });
    const response = await mw(ctx, okHandler);
    expect(response.status).toBe(200);
  });

  test("custom token header and cookie name", async () => {
    const mw = csrf({ tokenHeader: "x-my-token", cookieName: "my_csrf" });
    const token = "customtoken123456";
    const ctx = makeCtx("POST", {
      cookie: `my_csrf=${token}`,
      "x-my-token": token,
    });
    const response = await mw(ctx, okHandler);
    expect(response.status).toBe(200);
  });

  test("custom safe methods", async () => {
    const mw = csrf({ safeMethods: ["GET", "PATCH"] });
    const ctx = makeCtx("PATCH");
    const response = await mw(ctx, okHandler);
    expect(response.status).toBe(200);
  });

  test("DELETE requires token by default", async () => {
    const mw = csrf();
    const ctx = makeCtx("DELETE");
    const response = await mw(ctx, okHandler);
    expect(response.status).toBe(403);
  });
});

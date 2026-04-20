import { describe, test, expect } from "bun:test";
import { requestId } from "../middlewares/request-id";
import { createContext } from "../context";

function makeCtx(headers?: Record<string, string>) {
  const request = new Request("http://localhost/", {
    headers: new Headers(headers),
  });
  return createContext(request);
}

describe("requestId", () => {
  test("generates UUID when no header present", async () => {
    const mw = requestId();
    const ctx = makeCtx();
    const response = await mw(ctx, () => Promise.resolve(ctx.json({ ok: true })));
    const id = response.headers.get("X-Request-Id");
    expect(id).toBeTruthy();
    expect(id!.length).toBe(36); // UUID format
    expect(ctx.state.get("requestId")).toBe(id);
  });

  test("uses existing header value", async () => {
    const mw = requestId();
    const ctx = makeCtx({ "X-Request-Id": "abc-123" });
    const response = await mw(ctx, () => Promise.resolve(ctx.json({ ok: true })));
    expect(response.headers.get("X-Request-Id")).toBe("abc-123");
    expect(ctx.state.get("requestId")).toBe("abc-123");
  });

  test("custom header name", async () => {
    const mw = requestId("X-Trace-Id");
    const ctx = makeCtx({ "X-Trace-Id": "trace-456" });
    const response = await mw(ctx, () => Promise.resolve(ctx.json({ ok: true })));
    expect(response.headers.get("X-Trace-Id")).toBe("trace-456");
    expect(ctx.state.get("requestId")).toBe("trace-456");
  });

  test("generates ID with custom header name when missing", async () => {
    const mw = requestId("X-Trace-Id");
    const ctx = makeCtx();
    const response = await mw(ctx, () => Promise.resolve(ctx.json({ ok: true })));
    const id = response.headers.get("X-Trace-Id");
    expect(id).toBeTruthy();
    expect(id!.length).toBe(36);
  });
});

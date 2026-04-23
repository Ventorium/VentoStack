import { describe, expect, test } from "bun:test";
import { createContext } from "../context";

function makeRequest(url: string, method = "GET"): Request {
  return new Request(url, { method });
}

describe("createContext", () => {
  test("parses url, method, path from request", () => {
    const req = makeRequest("http://localhost:3000/users?page=1");
    const ctx = createContext(req);

    expect(ctx.request).toBe(req);
    expect(ctx.url.pathname).toBe("/users");
    expect(ctx.method).toBe("GET");
    expect(ctx.path).toBe("/users");
  });

  test("parses query string into record", () => {
    const req = makeRequest("http://localhost:3000/search?q=hello&limit=10");
    const ctx = createContext(req);

    expect(ctx.query.q).toBe("hello");
    expect(ctx.query.limit).toBe("10");
  });

  test("empty query when no params", () => {
    const req = makeRequest("http://localhost:3000/");
    const ctx = createContext(req);
    expect(Object.keys(ctx.query)).toHaveLength(0);
  });

  test("uses provided params", () => {
    const req = makeRequest("http://localhost:3000/users/42");
    const ctx = createContext(req, { id: "42" });
    expect(ctx.params.id).toBe("42");
  });

  test("defaults to empty params", () => {
    const req = makeRequest("http://localhost:3000/");
    const ctx = createContext(req);
    expect(ctx.params).toEqual({});
  });

  test("exposes headers from request", () => {
    const req = new Request("http://localhost:3000/", {
      headers: { "X-Custom": "test-value" },
    });
    const ctx = createContext(req);
    expect(ctx.headers.get("X-Custom")).toBe("test-value");
  });

  test("state is an empty object", () => {
    const ctx = createContext(makeRequest("http://localhost:3000/"));
    expect(typeof ctx.state).toBe("object");
    expect(Object.keys(ctx.state)).toHaveLength(0);
  });

  test("startTime is set", () => {
    const before = performance.now();
    const ctx = createContext(makeRequest("http://localhost:3000/"));
    const after = performance.now();
    expect(ctx.startTime).toBeGreaterThanOrEqual(before);
    expect(ctx.startTime).toBeLessThanOrEqual(after);
  });

  test("user and tenant are undefined by default", () => {
    const ctx = createContext(makeRequest("http://localhost:3000/"));
    expect(ctx.user).toBeUndefined();
    expect(ctx.tenant).toBeUndefined();
  });

  test("user and tenant can be set", () => {
    const ctx = createContext(makeRequest("http://localhost:3000/"));
    ctx.user = { id: "u1" };
    ctx.tenant = { id: "t1" };
    expect(ctx.user).toEqual({ id: "u1" });
    expect(ctx.tenant).toEqual({ id: "t1" });
  });
});

describe("Context response methods", () => {
  test("json() returns JSON response", async () => {
    const ctx = createContext(makeRequest("http://localhost:3000/"));
    const res = ctx.json({ name: "Alice" });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(await res.json()).toEqual({ name: "Alice" });
  });

  test("json() with custom status", async () => {
    const ctx = createContext(makeRequest("http://localhost:3000/"));
    const res = ctx.json({ created: true }, 201);
    expect(res.status).toBe(201);
  });

  test("text() returns text response", async () => {
    const ctx = createContext(makeRequest("http://localhost:3000/"));
    const res = ctx.text("hello");

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(await res.text()).toBe("hello");
  });

  test("text() with custom status", async () => {
    const ctx = createContext(makeRequest("http://localhost:3000/"));
    const res = ctx.text("accepted", 202);
    expect(res.status).toBe(202);
  });

  test("html() returns HTML response", async () => {
    const ctx = createContext(makeRequest("http://localhost:3000/"));
    const res = ctx.html("<h1>Hi</h1>");

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(await res.text()).toBe("<h1>Hi</h1>");
  });

  test("html() with custom status", async () => {
    const ctx = createContext(makeRequest("http://localhost:3000/"));
    const res = ctx.html("<p>not found</p>", 404);
    expect(res.status).toBe(404);
  });

  test("redirect() returns redirect response", () => {
    const ctx = createContext(makeRequest("http://localhost:3000/"));
    const res = ctx.redirect("/login");

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/login");
  });

  test("redirect() with custom status", () => {
    const ctx = createContext(makeRequest("http://localhost:3000/"));
    const res = ctx.redirect("/new-url", 301);
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("/new-url");
  });

  test("stream() returns streaming response", () => {
    const ctx = createContext(makeRequest("http://localhost:3000/"));
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("chunk"));
        controller.close();
      },
    });

    const res = ctx.stream(readable);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
  });

  test("stream() with custom content type", () => {
    const ctx = createContext(makeRequest("http://localhost:3000/"));
    const readable = new ReadableStream();
    const res = ctx.stream(readable, "text/event-stream");
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
  });

  test("stream() preserves asynchronously enqueued chunks", async () => {
    const ctx = createContext(makeRequest("http://localhost:3000/"));
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: hello\n\n"));
        setTimeout(() => {
          controller.enqueue(new TextEncoder().encode("data: world\n\n"));
          controller.close();
        }, 10);
      },
    });

    const res = ctx.stream(readable, "text/event-stream");
    expect(await res.text()).toBe("data: hello\n\ndata: world\n\n");
  });

  test("method reflects request method", () => {
    const ctx = createContext(makeRequest("http://localhost:3000/", "POST"));
    expect(ctx.method).toBe("POST");
  });
});

import { describe, test, expect, afterAll, beforeAll } from "bun:test";
import { createTestClient, type TestClient } from "../test-client";

let mockServer: ReturnType<typeof Bun.serve>;
let client: TestClient;

beforeAll(() => {
  mockServer = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/json") {
        return new Response(JSON.stringify({ ok: true, method: req.method }), {
          headers: { "content-type": "application/json" },
        });
      }

      if (url.pathname === "/text") {
        return new Response("hello text", {
          headers: { "content-type": "text/plain" },
        });
      }

      if (url.pathname === "/echo-headers") {
        const authorization = req.headers.get("authorization") ?? "";
        const custom = req.headers.get("x-custom") ?? "";
        return new Response(
          JSON.stringify({ authorization, custom }),
          { headers: { "content-type": "application/json" } },
        );
      }

      if (url.pathname === "/echo-query") {
        const params: Record<string, string> = {};
        url.searchParams.forEach((value, key) => {
          params[key] = value;
        });
        return new Response(JSON.stringify(params), {
          headers: { "content-type": "application/json" },
        });
      }

      if (url.pathname === "/echo-body") {
        const body = await req.text();
        const contentType = req.headers.get("content-type") ?? "";
        return new Response(
          JSON.stringify({ body, contentType, method: req.method }),
          { headers: { "content-type": "application/json" } },
        );
      }

      if (url.pathname === "/status/201") {
        return new Response(null, { status: 201 });
      }

      if (url.pathname === "/custom-header") {
        return new Response("ok", {
          headers: { "x-response-header": "test-value" },
        });
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  client = createTestClient(`http://localhost:${mockServer.port}`);
});

afterAll(() => {
  mockServer.stop(true);
});

describe("createTestClient", () => {
  describe("GET", () => {
    test("JSON response", async () => {
      const res = await client.get("/json");
      expect(res.status).toBe(200);
      expect(res.json()).toEqual({ ok: true, method: "GET" });
      expect(res.body).toEqual({ ok: true, method: "GET" });
    });

    test("text response", async () => {
      const res = await client.get("/text");
      expect(res.status).toBe(200);
      expect(res.text).toBe("hello text");
    });

    test("404 response", async () => {
      const res = await client.get("/nonexistent");
      expect(res.status).toBe(404);
    });
  });

  describe("POST", () => {
    test("sends JSON body", async () => {
      const res = await client.post("/echo-body", { name: "aeron" });
      const data = res.json<{ body: string; contentType: string; method: string }>();
      expect(data.method).toBe("POST");
      expect(data.contentType).toContain("application/json");
      expect(JSON.parse(data.body)).toEqual({ name: "aeron" });
    });

    test("sends string body", async () => {
      const res = await client.post("/echo-body", "raw text", {
        headers: { "content-type": "text/plain" },
      });
      const data = res.json<{ body: string; contentType: string }>();
      expect(data.body).toBe("raw text");
      expect(data.contentType).toBe("text/plain");
    });

    test("sends no body", async () => {
      const res = await client.post("/json");
      expect(res.status).toBe(200);
      expect(res.json<{ method: string }>().method).toBe("POST");
    });
  });

  describe("PUT", () => {
    test("sends JSON body", async () => {
      const res = await client.put("/echo-body", { updated: true });
      const data = res.json<{ body: string; method: string }>();
      expect(data.method).toBe("PUT");
      expect(JSON.parse(data.body)).toEqual({ updated: true });
    });
  });

  describe("PATCH", () => {
    test("sends JSON body", async () => {
      const res = await client.patch("/echo-body", { partial: true });
      const data = res.json<{ body: string; method: string }>();
      expect(data.method).toBe("PATCH");
      expect(JSON.parse(data.body)).toEqual({ partial: true });
    });
  });

  describe("DELETE", () => {
    test("sends request", async () => {
      const res = await client.delete("/json");
      expect(res.status).toBe(200);
      expect(res.json<{ method: string }>().method).toBe("DELETE");
    });
  });

  describe("query parameters", () => {
    test("appends query params to URL", async () => {
      const res = await client.get("/echo-query", {
        query: { page: "1", size: "10" },
      });
      expect(res.json()).toEqual({ page: "1", size: "10" });
    });

    test("handles empty query", async () => {
      const res = await client.get("/echo-query");
      expect(res.json()).toEqual({});
    });
  });

  describe("headers", () => {
    test("sends per-request headers", async () => {
      const res = await client.get("/echo-headers", {
        headers: { authorization: "Bearer token123" },
      });
      expect(res.json<{ authorization: string }>().authorization).toBe(
        "Bearer token123",
      );
    });

    test("reads response headers", async () => {
      const res = await client.get("/custom-header");
      expect(res.headers.get("x-response-header")).toBe("test-value");
    });
  });

  describe("setHeader / setHeaders", () => {
    test("setHeader sets persistent default header", async () => {
      const c = createTestClient(`http://localhost:${mockServer.port}`);
      c.setHeader("authorization", "Bearer default");

      const res = await c.get("/echo-headers");
      expect(res.json<{ authorization: string }>().authorization).toBe(
        "Bearer default",
      );
    });

    test("setHeaders sets multiple persistent headers", async () => {
      const c = createTestClient(`http://localhost:${mockServer.port}`);
      c.setHeaders({
        authorization: "Bearer multi",
        "x-custom": "value",
      });

      const res = await c.get("/echo-headers");
      const data = res.json<{ authorization: string; custom: string }>();
      expect(data.authorization).toBe("Bearer multi");
      expect(data.custom).toBe("value");
    });

    test("per-request headers override defaults", async () => {
      const c = createTestClient(`http://localhost:${mockServer.port}`);
      c.setHeader("authorization", "Bearer default");

      const res = await c.get("/echo-headers", {
        headers: { authorization: "Bearer override" },
      });
      expect(res.json<{ authorization: string }>().authorization).toBe(
        "Bearer override",
      );
    });

    test("setHeader returns client for chaining", async () => {
      const c = createTestClient(`http://localhost:${mockServer.port}`);
      const result = c.setHeader("x-custom", "chained");
      expect(result).toBe(c);
    });

    test("setHeaders returns client for chaining", async () => {
      const c = createTestClient(`http://localhost:${mockServer.port}`);
      const result = c.setHeaders({ "x-custom": "chained" });
      expect(result).toBe(c);
    });
  });

  describe("status codes", () => {
    test("handles 201 status", async () => {
      const res = await client.get("/status/201");
      expect(res.status).toBe(201);
    });
  });

  describe("json() on non-JSON", () => {
    test("parses text as JSON when called explicitly", async () => {
      const c = createTestClient(`http://localhost:${mockServer.port}`);
      const res = await c.get("/text");
      expect(() => res.json()).toThrow();
    });
  });
});

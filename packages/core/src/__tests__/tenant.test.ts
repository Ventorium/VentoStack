// @aeron/core - 多租户中间件测试

import { describe, expect, it } from "bun:test";
import { createTenantMiddleware } from "../middlewares/tenant";
import { createContext } from "../context";
import type { NextFunction } from "../middleware";

function makeRequest(url: string, headers?: Record<string, string>): Request {
  return new Request(url, { headers });
}

function makeNext(): NextFunction {
  return () => Promise.resolve(new Response("OK", { status: 200 }));
}

describe("createTenantMiddleware", () => {
  describe("header strategy", () => {
    it("should resolve tenant from default header", async () => {
      const { middleware } = createTenantMiddleware({ strategy: "header" });
      const ctx = createContext(
        makeRequest("http://localhost/api", { "x-tenant-id": "tenant1" }),
      );
      const res = await middleware(ctx, makeNext());
      expect(res.status).toBe(200);
      expect(ctx.tenant).toEqual({ tenantId: "tenant1" });
    });

    it("should resolve tenant from custom header name", async () => {
      const { middleware } = createTenantMiddleware({
        strategy: "header",
        headerName: "x-org-id",
      });
      const ctx = createContext(
        makeRequest("http://localhost/api", { "x-org-id": "org42" }),
      );
      const res = await middleware(ctx, makeNext());
      expect(res.status).toBe(200);
      expect(ctx.tenant).toEqual({ tenantId: "org42" });
    });

    it("should return 400 when header is missing", async () => {
      const { middleware } = createTenantMiddleware({ strategy: "header" });
      const ctx = createContext(makeRequest("http://localhost/api"));
      const res = await middleware(ctx, makeNext());
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Missing tenant identifier");
    });
  });

  describe("subdomain strategy", () => {
    it("should resolve tenant from subdomain", async () => {
      const { middleware } = createTenantMiddleware({ strategy: "subdomain" });
      const ctx = createContext(
        makeRequest("http://tenant1.example.com/api"),
      );
      const res = await middleware(ctx, makeNext());
      expect(res.status).toBe(200);
      expect(ctx.tenant).toEqual({ tenantId: "tenant1" });
    });

    it("should return 400 for bare domain (no subdomain)", async () => {
      const { middleware } = createTenantMiddleware({ strategy: "subdomain" });
      const ctx = createContext(makeRequest("http://example.com/api"));
      const res = await middleware(ctx, makeNext());
      expect(res.status).toBe(400);
    });

    it("should handle subdomain with port", async () => {
      const { middleware } = createTenantMiddleware({ strategy: "subdomain" });
      const ctx = createContext(
        makeRequest("http://acme.example.com:3000/api"),
      );
      const res = await middleware(ctx, makeNext());
      expect(res.status).toBe(200);
      expect(ctx.tenant).toEqual({ tenantId: "acme" });
    });
  });

  describe("path strategy", () => {
    it("should resolve tenant from first path segment", async () => {
      const { middleware } = createTenantMiddleware({ strategy: "path" });
      const ctx = createContext(
        makeRequest("http://localhost/tenant1/api/users"),
      );
      const res = await middleware(ctx, makeNext());
      expect(res.status).toBe(200);
      expect(ctx.tenant).toEqual({ tenantId: "tenant1" });
    });

    it("should return 400 for root path", async () => {
      const { middleware } = createTenantMiddleware({ strategy: "path" });
      const ctx = createContext(makeRequest("http://localhost/"));
      const res = await middleware(ctx, makeNext());
      expect(res.status).toBe(400);
    });
  });

  describe("custom strategy", () => {
    it("should use custom resolver function", async () => {
      const { middleware } = createTenantMiddleware({
        strategy: "custom",
        customResolver: (req) => req.headers.get("authorization")?.split(":")[0] ?? null,
      });
      const ctx = createContext(
        makeRequest("http://localhost/api", { authorization: "tenant99:token" }),
      );
      const res = await middleware(ctx, makeNext());
      expect(res.status).toBe(200);
      expect(ctx.tenant).toEqual({ tenantId: "tenant99" });
    });

    it("should return 400 when custom resolver returns null", async () => {
      const { middleware } = createTenantMiddleware({
        strategy: "custom",
        customResolver: () => null,
      });
      const ctx = createContext(makeRequest("http://localhost/api"));
      const res = await middleware(ctx, makeNext());
      expect(res.status).toBe(400);
    });
  });

  describe("response header", () => {
    it("should attach x-tenant-id header to response", async () => {
      const { middleware } = createTenantMiddleware({ strategy: "header" });
      const ctx = createContext(
        makeRequest("http://localhost/api", { "x-tenant-id": "t1" }),
      );
      const res = await middleware(ctx, makeNext());
      expect(res.headers.get("x-tenant-id")).toBe("t1");
    });
  });

  describe("getTenantFromRequest", () => {
    it("should extract tenant from request without middleware", () => {
      const { getTenantFromRequest } = createTenantMiddleware({
        strategy: "header",
      });
      const req = makeRequest("http://localhost/api", {
        "x-tenant-id": "direct",
      });
      expect(getTenantFromRequest(req)).toBe("direct");
    });

    it("should return null when no tenant present", () => {
      const { getTenantFromRequest } = createTenantMiddleware({
        strategy: "header",
      });
      const req = makeRequest("http://localhost/api");
      expect(getTenantFromRequest(req)).toBeNull();
    });
  });
});

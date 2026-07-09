/**
 * @ventostack/system - AuthGuard 中间件测试
 */

import { describe, expect, mock, test } from "bun:test";
import { createAuthMiddleware, createPermMiddleware } from "@ventostack/auth";
import { createMockJWTManager, createMockRBAC } from "./helpers";

function createContext(overrides: Record<string, any> = {}) {
  const request = new Request(overrides.url ?? "http://localhost/api/test", {
    method: "GET",
    headers: overrides.headers ?? {},
  });
  return {
    request,
    url: new URL(request.url),
    method: "GET",
    path: "/api/test",
    params: {},
    query: {},
    body: {},
    headers: request.headers,
    formData: {},
    state: {},
    startTime: performance.now(),
    user: undefined as unknown,
    tenant: undefined as unknown,
    json: mock(
      (data: any) =>
        new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } }),
    ),
    ...overrides,
  };
}

describe("createAuthMiddleware", () => {
  test("valid Bearer token passes through", async () => {
    const jwt = createMockJWTManager();
    jwt.verify.mockResolvedValue({ sub: "u1", roles: ["admin"], username: "admin" } as any);
    const middleware = createAuthMiddleware(jwt, "secret");

    const ctx = createContext({
      headers: { Authorization: "Bearer valid-token" },
    });

    let nextCalled = false;
    const next = async () => {
      nextCalled = true;
      return new Response("ok");
    };

    const response = await middleware(ctx as any, next);
    expect(nextCalled).toBe(true);
    expect(ctx.user).toEqual({ id: "u1", roles: ["admin"], username: "admin" });
  });

  test("cookie token passes through when Authorization header is missing", async () => {
    const jwt = createMockJWTManager();
    jwt.verify.mockResolvedValue({ sub: "u1", roles: ["admin"], username: "admin" } as any);
    const middleware = createAuthMiddleware(jwt, "secret");

    const ctx = createContext({
      headers: { Cookie: "vs_access_token=cookie-token" },
    });

    let nextCalled = false;
    const next = async () => {
      nextCalled = true;
      return new Response("ok");
    };

    await middleware(ctx as any, next);
    expect(nextCalled).toBe(true);
    expect(jwt.verify).toHaveBeenCalledWith("cookie-token", "secret");
  });

  test("missing all token sources returns 401", async () => {
    const jwt = createMockJWTManager();
    const middleware = createAuthMiddleware(jwt, "secret");

    const ctx = createContext({ url: "http://localhost/api/test?token=query-token" });
    const next = async () => new Response("ok");

    const resp = await middleware(ctx as any, next) as Response;
    expect(resp.status).toBe(401);
  });

  test("Authorization header takes precedence over cookie and query token", async () => {
    const jwt = createMockJWTManager();
    jwt.verify.mockResolvedValue({ sub: "u1", roles: ["admin"], username: "admin" } as any);
    const middleware = createAuthMiddleware(jwt, "secret");

    const ctx = createContext({
      url: "http://localhost/api/test?token=query-token",
      headers: { Authorization: "Bearer header-token", Cookie: "vs_access_token=cookie-token" },
    });
    const next = async () => new Response("ok");

    await middleware(ctx as any, next);
    expect(jwt.verify).toHaveBeenCalledWith("header-token", "secret");
  });

  test("missing Authorization header returns 401", async () => {
    const jwt = createMockJWTManager();
    const middleware = createAuthMiddleware(jwt, "secret");

    const ctx = createContext({ headers: {} });
    const next = async () => new Response("ok");

    const response = (await middleware(ctx as any, next)) as Response;
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.code).toBe(401);
  });

  test("invalid token returns 401", async () => {
    const jwt = createMockJWTManager();
    jwt.verify.mockRejectedValue(new Error("Invalid") as any);
    const middleware = createAuthMiddleware(jwt, "secret");

    const ctx = createContext({
      headers: { Authorization: "Bearer bad-token" },
    });
    const next = async () => new Response("ok");

    const response = (await middleware(ctx as any, next)) as Response;
    expect(response.status).toBe(401);
  });

  test("token without Bearer prefix returns 401", async () => {
    const jwt = createMockJWTManager();
    const middleware = createAuthMiddleware(jwt, "secret");

    const ctx = createContext({
      headers: { Authorization: "Basic abc123" },
    });
    const next = async () => new Response("ok");

    const response = (await middleware(ctx as any, next)) as Response;
    expect(response.status).toBe(401);
  });
});

describe("createPermMiddleware", () => {
  test("user with permission passes through", async () => {
    const rbac = createMockRBAC();
    rbac.hasPermission.mockReturnValue(true as any);
    const perm = createPermMiddleware(rbac);
    const middleware = perm("system", "user:list");

    const ctx = createContext();
    ctx.user = { id: "u1", roles: ["admin"], username: "admin" };

    let nextCalled = false;
    const next = async () => {
      nextCalled = true;
      return new Response("ok");
    };

    await middleware(ctx as any, next);
    expect(nextCalled).toBe(true);
  });

  test("user without permission returns 403", async () => {
    const rbac = createMockRBAC();
    rbac.hasPermission.mockReturnValue(false as any);
    const perm = createPermMiddleware(rbac);
    const middleware = perm("system", "user:delete");

    const ctx = createContext();
    ctx.user = { id: "u1", roles: ["viewer"], username: "viewer" };
    const next = async () => new Response("ok");

    const response = (await middleware(ctx as any, next)) as Response;
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.message).toContain("system:user:delete");
  });

  test("no user returns 401", async () => {
    const rbac = createMockRBAC();
    const perm = createPermMiddleware(rbac);
    const middleware = perm("system", "user:list");

    const ctx = createContext();
    // ctx.user is undefined
    const next = async () => new Response("ok");

    const response = (await middleware(ctx as any, next)) as Response;
    expect(response.status).toBe(401);
  });
});

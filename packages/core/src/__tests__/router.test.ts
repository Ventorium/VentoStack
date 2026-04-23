import { describe, expect, test } from "bun:test";
import type { Middleware } from "../middleware";
import { createRouter, parseRoutePath } from "../router";

type RouteHandler = (req: Request) => Response | Promise<Response>;

describe("createRouter", () => {
  test("registers GET route", () => {
    const router = createRouter();
    const handler = async () => new Response("ok");
    router.get("/users", handler);

    const routes = router.routes();
    expect(routes).toHaveLength(1);
    expect(routes[0]!.method).toBe("GET");
    expect(routes[0]!.path).toBe("/users");
    expect(routes[0]!.strippedPath).toBe("/users");
  });

  test("registers POST route", () => {
    const router = createRouter();
    router.post("/users", async () => new Response("ok"));
    expect(router.routes()[0]!.method).toBe("POST");
  });

  test("registers PUT route", () => {
    const router = createRouter();
    router.put("/users/:id", async () => new Response("ok"));
    expect(router.routes()[0]!.method).toBe("PUT");
    expect(router.routes()[0]!.path).toBe("/users/:id");
  });

  test("registers PATCH route", () => {
    const router = createRouter();
    router.patch("/users/:id", async () => new Response("ok"));
    expect(router.routes()[0]!.method).toBe("PATCH");
  });

  test("registers DELETE route", () => {
    const router = createRouter();
    router.delete("/users/:id", async () => new Response("ok"));
    expect(router.routes()[0]!.method).toBe("DELETE");
  });

  test("method chaining works", () => {
    const router = createRouter();
    const result = router
      .get("/a", async () => new Response("a"))
      .post("/b", async () => new Response("b"));

    expect(result).toBe(router);
    expect(router.routes()).toHaveLength(2);
  });
});

describe("Router.use()", () => {
  test("router middleware applies to all routes", () => {
    const calls: string[] = [];
    const mw: Middleware = async (_ctx, next) => {
      calls.push("router-mw");
      return await next();
    };

    const router = createRouter();
    router.use(mw);
    router.get("/a", async (ctx) => ctx.text("a"));

    const routes = router.routes();
    expect(routes[0]!.middleware).toHaveLength(1);
  });

  test("router middleware + route middleware combine", () => {
    const routerMw: Middleware = async (_ctx, next) => await next();
    const routeMw: Middleware = async (_ctx, next) => await next();

    const router = createRouter();
    router.use(routerMw);
    router.get("/a", async (ctx) => ctx.text("a"), routeMw);

    const routes = router.routes();
    // router middleware + route middleware
    expect(routes[0]!.middleware).toHaveLength(2);
  });
});

describe("Router.group()", () => {
  test("prefixes paths in group", () => {
    const router = createRouter();
    router.group("/api", (group) => {
      group.get("/users", async () => new Response("users"));
      group.post("/users", async () => new Response("create"));
    });

    const routes = router.routes();
    expect(routes).toHaveLength(2);
    expect(routes[0]!.path).toBe("/api/users");
    expect(routes[1]!.path).toBe("/api/users");
    expect(routes[0]!.strippedPath).toBe("/api/users");
    expect(routes[0]!.method).toBe("GET");
    expect(routes[1]!.method).toBe("POST");
  });

  test("group middleware applies to grouped routes", () => {
    const groupMw: Middleware = async (_ctx, next) => await next();

    const router = createRouter();
    router.group(
      "/api",
      (group) => {
        group.get("/health", async (ctx) => ctx.text("ok"));
      },
      groupMw,
    );

    const routes = router.routes();
    expect(routes[0]!.middleware).toContain(groupMw);
  });

  test("nested groups accumulate prefixes", () => {
    const router = createRouter();
    router.group("/api", (api) => {
      api.group("/v1", (v1) => {
        v1.get("/users", async () => new Response("ok"));
      });
    });

    expect(router.routes()[0]!.path).toBe("/api/v1/users");
    expect(router.routes()[0]!.strippedPath).toBe("/api/v1/users");
  });

  test("sub-router middleware included in group routes", () => {
    const subMw: Middleware = async (_ctx, next) => await next();
    const groupMw: Middleware = async (_ctx, next) => await next();

    const router = createRouter();
    router.group(
      "/api",
      (group) => {
        group.use(subMw);
        group.get("/users", async (ctx) => ctx.text("ok"));
      },
      groupMw,
    );

    const routes = router.routes();
    // group middleware + sub-router middleware
    expect(routes[0]!.middleware).toHaveLength(2);
    expect(routes[0]!.middleware[0]).toBe(groupMw);
    expect(routes[0]!.middleware[1]).toBe(subMw);
  });

  test("group returns router for chaining", () => {
    const router = createRouter();
    const result = router.group("/api", () => {});
    expect(result).toBe(router);
  });
});

describe("Router.compile()", () => {
  test("compiles routes to Bun.serve format", () => {
    const router = createRouter();
    router.get("/health", async (ctx) => ctx.text("ok"));
    router.post("/users", async (ctx) => ctx.json({ id: 1 }));

    const compiled = router.compile();

    expect(compiled["/health"]).toBeDefined();
    expect(compiled["/users"]).toBeDefined();
    expect(typeof (compiled["/health"] as Record<string, unknown>).GET).toBe("function");
    expect(typeof (compiled["/users"] as Record<string, unknown>).POST).toBe("function");
  });

  test("compiled handler creates context and returns response", async () => {
    const router = createRouter();
    router.get("/hello", (ctx) => ctx.json({ message: "hello" }));

    const compiled = router.compile();
    const handler = (compiled["/hello"] as Record<string, RouteHandler>).GET!;

    const req = new Request("http://localhost:3000/hello");
    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "hello" });
  });

  test("compiled handler passes params from request", async () => {
    const router = createRouter();
    router.get("/users/:id", (ctx) => ctx.json({ id: ctx.params.id }));

    const compiled = router.compile();
    const handler = (compiled["/users/:id"] as Record<string, RouteHandler>).GET!;

    // Simulate Bun.serve adding params to request
    const req = new Request("http://localhost:3000/users/42");
    Object.defineProperty(req, "params", { value: { id: "42" } });

    const res = await handler(req);
    expect(await res.json()).toEqual({ id: "42" });
  });

  test("compiled handler runs middleware", async () => {
    const calls: string[] = [];
    const mw: Middleware = async (_ctx, next) => {
      calls.push("mw");
      return await next();
    };

    const router = createRouter();
    router.get(
      "/test",
      (ctx) => {
        calls.push("handler");
        return ctx.text("ok");
      },
      mw,
    );

    const compiled = router.compile();
    const handler = (compiled["/test"] as Record<string, RouteHandler>).GET!;
    await handler(new Request("http://localhost:3000/test"));

    expect(calls).toEqual(["mw", "handler"]);
  });

  test("compiled handler runs global middleware", async () => {
    const calls: string[] = [];
    const globalMw: Middleware = async (_ctx, next) => {
      calls.push("global");
      return await next();
    };

    const router = createRouter();
    router.get("/test", (ctx) => {
      calls.push("handler");
      return ctx.text("ok");
    });

    const compiled = router.compile([globalMw]);
    const handler = (compiled["/test"] as Record<string, RouteHandler>).GET!;
    await handler(new Request("http://localhost:3000/test"));

    expect(calls).toEqual(["global", "handler"]);
  });

  test("multiple methods on same path compile to method object", () => {
    const router = createRouter();
    router.get("/users", async (ctx) => ctx.json([]));
    router.post("/users", async (ctx) => ctx.json({ id: 1 }, 201));

    const compiled = router.compile();
    const methods = compiled["/users"] as Record<string, RouteHandler>;
    expect(typeof methods.GET).toBe("function");
    expect(typeof methods.POST).toBe("function");
  });

  test("handler without middleware skips compose", async () => {
    const router = createRouter();
    router.get("/fast", (ctx) => ctx.text("fast"));

    const compiled = router.compile();
    const handler = (compiled["/fast"] as Record<string, RouteHandler>).GET!;
    const res = await handler(new Request("http://localhost:3000/fast"));
    expect(await res.text()).toBe("fast");
  });
});

describe("parseRoutePath", () => {
  test("parses typed param", () => {
    const parsed = parseRoutePath("/users/:id<int>");
    expect(parsed.strippedPath).toBe("/users/:id");
    expect(parsed.params).toHaveLength(1);
    expect(parsed.params[0]).toEqual({ name: "id", type: "int" });
  });

  test("parses typed param with custom regex", () => {
    const parsed = parseRoutePath("/users/:year<int>(\\d{4})");
    expect(parsed.strippedPath).toBe("/users/:year");
    expect(parsed.params[0]).toEqual({ name: "year", type: "int", customRegex: "\\d{4}" });
  });

  test("parses multiple typed params", () => {
    const parsed = parseRoutePath("/users/:id<int>/posts/:slug<string>");
    expect(parsed.strippedPath).toBe("/users/:id/posts/:slug");
    expect(parsed.params).toHaveLength(2);
    expect(parsed.params[0]).toEqual({ name: "id", type: "int" });
    expect(parsed.params[1]).toEqual({ name: "slug", type: "string" });
  });

  test("parses multiple untyped params", () => {
    const parsed = parseRoutePath("/orgs/:orgId/repos/:repoId");
    expect(parsed.strippedPath).toBe("/orgs/:orgId/repos/:repoId");
    expect(parsed.params).toHaveLength(0);
  });

  test("parses mixed typed and untyped params", () => {
    const parsed = parseRoutePath("/users/:userId<int>/posts/:postId");
    expect(parsed.strippedPath).toBe("/users/:userId/posts/:postId");
    expect(parsed.params).toHaveLength(1);
    expect(parsed.params[0]).toEqual({ name: "userId", type: "int" });
  });

  test("parses untyped params with custom regex", () => {
    const parsed = parseRoutePath("/users/:userId(\\d{2,4})/posts/:postId(^ey[a-zA-Z0-9]{8}==$)");
    expect(parsed.strippedPath).toBe("/users/:userId/posts/:postId");
    expect(parsed.params).toHaveLength(2);
    expect(parsed.params[0]).toEqual({ name: "userId", type: "string", customRegex: "\\d{2,4}" });
    expect(parsed.params[1]).toEqual({
      name: "postId",
      type: "string",
      customRegex: "^ey[a-zA-Z0-9]{8}==$",
    });
  });

  test("parses multiple typed params with custom regex", () => {
    const parsed = parseRoutePath("/users/:year<int>(\\d{4})/posts/:slug<string>(^[a-z]{3}$)");
    expect(parsed.strippedPath).toBe("/users/:year/posts/:slug");
    expect(parsed.params).toHaveLength(2);
    expect(parsed.params[0]).toEqual({ name: "year", type: "int", customRegex: "\\d{4}" });
    expect(parsed.params[1]).toEqual({ name: "slug", type: "string", customRegex: "^[a-z]{3}$" });
  });

  test("parses custom regex with escaped parentheses", () => {
    const parsed = parseRoutePath("/files/:name<string>(^[a-z]+\\([0-9]+\\)$)");
    expect(parsed.strippedPath).toBe("/files/:name");
    expect(parsed.params).toHaveLength(1);
    expect(parsed.params[0]).toEqual({
      name: "name",
      type: "string",
      customRegex: "^[a-z]+\\([0-9]+\\)$",
    });
  });

  test("parses custom regex with non-capturing groups", () => {
    const parsed = parseRoutePath("/items/:code<string>(^(?:ab|cd)[0-9]{2}$)");
    expect(parsed.strippedPath).toBe("/items/:code");
    expect(parsed.params).toHaveLength(1);
    expect(parsed.params[0]).toEqual({
      name: "code",
      type: "string",
      customRegex: "^(?:ab|cd)[0-9]{2}$",
    });
  });

  test("parses custom regex with nested non-capturing groups", () => {
    const parsed = parseRoutePath("/items/:code<string>(^(?:foo(?:bar)?|baz)$)");
    expect(parsed.strippedPath).toBe("/items/:code");
    expect(parsed.params).toHaveLength(1);
    expect(parsed.params[0]).toEqual({
      name: "code",
      type: "string",
      customRegex: "^(?:foo(?:bar)?|baz)$",
    });
  });

  test("leaves untyped params unchanged", () => {
    const parsed = parseRoutePath("/users/:id");
    expect(parsed.strippedPath).toBe("/users/:id");
    expect(parsed.params).toHaveLength(0);
  });

  test("throws on unknown param type", () => {
    expect(() => parseRoutePath("/users/:id<bigint>")).toThrow('Unknown param type "bigint"');
  });
});

describe("Router - typed params runtime coercion", () => {
  test("keeps untyped params as strings", async () => {
    const router = createRouter();
    router.get("/users/:userId/posts/:postId", (ctx) =>
      ctx.json({
        userId: ctx.params.userId,
        postId: ctx.params.postId,
        types: [typeof ctx.params.userId, typeof ctx.params.postId],
      }),
    );

    const compiled = router.compile();
    const handler = (compiled["/users/:userId/posts/:postId"] as Record<string, RouteHandler>).GET!;

    const req = new Request("http://localhost:3000/users/113/posts/aa");
    Object.defineProperty(req, "params", { value: { userId: "113", postId: "aa" } });

    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: "113", postId: "aa", types: ["string", "string"] });
  });

  test("coerces int param to number", async () => {
    const router = createRouter();
    router.get("/users/:id<int>", (ctx) => ctx.json({ id: ctx.params.id, type: typeof ctx.params.id }));

    const compiled = router.compile();
    const handler = (compiled["/users/:id"] as Record<string, RouteHandler>).GET!;

    const req = new Request("http://localhost:3000/users/42");
    Object.defineProperty(req, "params", { value: { id: "42" } });

    const res = await handler(req);
    expect(await res.json()).toEqual({ id: 42, type: "number" });
  });

  test("coerces bool param to boolean", async () => {
    const router = createRouter();
    router.get("/flags/:enabled<bool>", (ctx) => ctx.json({ enabled: ctx.params.enabled, type: typeof ctx.params.enabled }));

    const compiled = router.compile();
    const handler = (compiled["/flags/:enabled"] as Record<string, RouteHandler>).GET!;

    const req = new Request("http://localhost:3000/flags/true");
    Object.defineProperty(req, "params", { value: { enabled: "true" } });

    const res = await handler(req);
    expect(await res.json()).toEqual({ enabled: true, type: "boolean" });
  });

  test("coerces date param to Date", async () => {
    const router = createRouter();
    router.get("/events/:at<date>", (ctx) => ctx.json({ at: (ctx.params.at as Date).toISOString() }));

    const compiled = router.compile();
    const handler = (compiled["/events/:at"] as Record<string, RouteHandler>).GET!;

    const req = new Request("http://localhost:3000/events/2024-01-15T10:30:00Z");
    Object.defineProperty(req, "params", { value: { at: "2024-01-15T10:30:00Z" } });

    const res = await handler(req);
    expect(await res.json()).toEqual({ at: "2024-01-15T10:30:00.000Z" });
  });

  test("returns 400 for invalid int value", async () => {
    const router = createRouter();
    router.get("/users/:id<int>", (ctx) => ctx.json({ id: ctx.params.id }));

    const compiled = router.compile();
    const handler = (compiled["/users/:id"] as Record<string, RouteHandler>).GET!;

    const req = new Request("http://localhost:3000/users/abc");
    Object.defineProperty(req, "params", { value: { id: "abc" } });

    const res = await handler(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  test("uses custom regex for validation", async () => {
    const router = createRouter();
    router.get("/users/:code<string>(^[A-Z]{2}$)", (ctx) => ctx.json({ code: ctx.params.code }));

    const compiled = router.compile();
    const handler = (compiled["/users/:code"] as Record<string, RouteHandler>).GET!;

    const reqOk = new Request("http://localhost:3000/users/AB");
    Object.defineProperty(reqOk, "params", { value: { code: "AB" } });
    const resOk = await handler(reqOk);
    expect(resOk.status).toBe(200);

    const reqBad = new Request("http://localhost:3000/users/ab");
    Object.defineProperty(reqBad, "params", { value: { code: "ab" } });
    const resBad = await handler(reqBad);
    expect(resBad.status).toBe(400);
  });

  test("uses custom regex for multiple typed params", async () => {
    const router = createRouter();
    router.get("/users/:year<int>(\\d{4})/posts/:slug<string>(^[a-z]{3}$)", (ctx) =>
      ctx.json({
        year: ctx.params.year,
        slug: ctx.params.slug,
        types: [typeof ctx.params.year, typeof ctx.params.slug],
      }),
    );

    const compiled = router.compile();
    const handler = (compiled["/users/:year/posts/:slug"] as Record<string, RouteHandler>).GET!;

    const reqOk = new Request("http://localhost:3000/users/2024/posts/abc");
    Object.defineProperty(reqOk, "params", { value: { year: "2024", slug: "abc" } });
    const resOk = await handler(reqOk);
    expect(resOk.status).toBe(200);
    expect(await resOk.json()).toEqual({ year: 2024, slug: "abc", types: ["number", "string"] });

    const reqBad = new Request("http://localhost:3000/users/2024/posts/ab");
    Object.defineProperty(reqBad, "params", { value: { year: "2024", slug: "ab" } });
    const resBad = await handler(reqBad);
    expect(resBad.status).toBe(400);
  });

  test("uses custom regex with escaped parentheses", async () => {
    const router = createRouter();
    router.get("/files/:name<string>(^[a-z]+\\([0-9]+\\)$)", (ctx) =>
      ctx.json({
        name: ctx.params.name,
        type: typeof ctx.params.name,
      }),
    );

    const compiled = router.compile();
    const handler = (compiled["/files/:name"] as Record<string, RouteHandler>).GET!;

    const reqOk = new Request("http://localhost:3000/files/abc(123)");
    Object.defineProperty(reqOk, "params", { value: { name: "abc(123)" } });
    const resOk = await handler(reqOk);
    expect(resOk.status).toBe(200);
    expect(await resOk.json()).toEqual({ name: "abc(123)", type: "string" });

    const reqBad = new Request("http://localhost:3000/files/abc123");
    Object.defineProperty(reqBad, "params", { value: { name: "abc123" } });
    const resBad = await handler(reqBad);
    expect(resBad.status).toBe(400);
  });

  test("uses custom regex with non-capturing groups", async () => {
    const router = createRouter();
    router.get("/items/:code<string>(^(?:ab|cd)[0-9]{2}$)", (ctx) =>
      ctx.json({
        code: ctx.params.code,
        type: typeof ctx.params.code,
      }),
    );

    const compiled = router.compile();
    const handler = (compiled["/items/:code"] as Record<string, RouteHandler>).GET!;

    const reqOk = new Request("http://localhost:3000/items/ab12");
    Object.defineProperty(reqOk, "params", { value: { code: "ab12" } });
    const resOk = await handler(reqOk);
    expect(resOk.status).toBe(200);
    expect(await resOk.json()).toEqual({ code: "ab12", type: "string" });

    const reqBad = new Request("http://localhost:3000/items/zz12");
    Object.defineProperty(reqBad, "params", { value: { code: "zz12" } });
    const resBad = await handler(reqBad);
    expect(resBad.status).toBe(400);
  });

  test("uses custom regex with nested non-capturing groups", async () => {
    const router = createRouter();
    router.get("/items/:code<string>(^(?:foo(?:bar)?|baz)$)", (ctx) =>
      ctx.json({
        code: ctx.params.code,
        type: typeof ctx.params.code,
      }),
    );

    const compiled = router.compile();
    const handler = (compiled["/items/:code"] as Record<string, RouteHandler>).GET!;

    const reqOk = new Request("http://localhost:3000/items/foobar");
    Object.defineProperty(reqOk, "params", { value: { code: "foobar" } });
    const resOk = await handler(reqOk);
    expect(resOk.status).toBe(200);
    expect(await resOk.json()).toEqual({ code: "foobar", type: "string" });

    const reqBad = new Request("http://localhost:3000/items/qux");
    Object.defineProperty(reqBad, "params", { value: { code: "qux" } });
    const resBad = await handler(reqBad);
    expect(resBad.status).toBe(400);
  });

  test("uses untyped params with custom regex", async () => {
    const router = createRouter();
    router.get("/users/:userId(\\d{2,4})/posts/:postId(^ey[a-zA-Z0-9]{8}==$)", (ctx) =>
      ctx.json({
        userId: ctx.params.userId,
        postId: ctx.params.postId,
        types: [typeof ctx.params.userId, typeof ctx.params.postId],
      }),
    );

    const compiled = router.compile();
    const handler = (compiled["/users/:userId/posts/:postId"] as Record<string, RouteHandler>).GET!;

    const reqOk = new Request("http://localhost:3000/users/11/posts/eyaaaaaaaa==");
    Object.defineProperty(reqOk, "params", { value: { userId: "11", postId: "eyaaaaaaaa==" } });
    const resOk = await handler(reqOk);
    expect(resOk.status).toBe(200);
    expect(await resOk.json()).toEqual({ userId: "11", postId: "eyaaaaaaaa==", types: ["string", "string"] });

    const reqBad = new Request("http://localhost:3000/users/abc/posts/eyaaaaaaaa==");
    Object.defineProperty(reqBad, "params", { value: { userId: "abc", postId: "eyaaaaaaaa==" } });
    const resBad = await handler(reqBad);
    expect(resBad.status).toBe(400);
  });
});

describe("Router - duplicate detection with stripped paths", () => {
  test("throws for same stripped path with different types", () => {
    const router = createRouter();
    router.get("/users/:id<int>", (ctx) => ctx.json({ id: ctx.params.id }));
    router.get("/users/:id<string>", (ctx) => ctx.json({ id: ctx.params.id }));

    expect(() => router.compile()).toThrow("Duplicate route detected: GET /users/:id");
  });

  test("allows same path with different methods even with types", () => {
    const router = createRouter();
    router.get("/users/:id<int>", (ctx) => ctx.json({ id: ctx.params.id }));
    router.post("/users/:id<int>", (ctx) => ctx.json({ id: ctx.params.id }));

    expect(() => router.compile()).not.toThrow();
  });
});

describe("Router - query schema", () => {
  test("coerces query params by schema", async () => {
    const router = createRouter();
    router.get("/users", {
      query: {
        page: { type: "int", default: 1 },
        limit: { type: "int", default: 20 },
      },
    }, (ctx) => ctx.json({
      page: ctx.query.page,
      limit: ctx.query.limit,
      types: [typeof ctx.query.page, typeof ctx.query.limit],
    }));

    const compiled = router.compile();
    const handler = (compiled["/users"] as Record<string, RouteHandler>).GET!;
    const req = new Request("http://localhost:3000/users?page=3&limit=10");
    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ page: 3, limit: 10, types: ["number", "number"] });
  });

  test("applies default values for missing query params", async () => {
    const router = createRouter();
    router.get("/users", {
      query: {
        page: { type: "int", default: 1 },
        limit: { type: "int", default: 20 },
      },
    }, (ctx) => ctx.json({
      page: ctx.query.page,
      limit: ctx.query.limit,
    }));

    const compiled = router.compile();
    const handler = (compiled["/users"] as Record<string, RouteHandler>).GET!;
    const req = new Request("http://localhost:3000/users");
    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ page: 1, limit: 20 });
  });

  test("returns 400 for invalid query params", async () => {
    const router = createRouter();
    router.get("/users", {
      query: {
        page: { type: "int", required: true },
      },
    }, (ctx) => ctx.json({ page: ctx.query.page }));

    const compiled = router.compile();
    const handler = (compiled["/users"] as Record<string, RouteHandler>).GET!;
    const req = new Request("http://localhost:3000/users?page=abc");
    const res = await handler(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
    expect(body.errors).toBeDefined();
  });
});

describe("Router - body schema", () => {
  test("parses and validates JSON body", async () => {
    const router = createRouter();
    router.post("/users", {
      body: {
        name: { type: "string", required: true },
        age: { type: "int" },
      },
    }, (ctx) => ctx.json({
      name: ctx.body.name,
      age: ctx.body.age,
      types: [typeof ctx.body.name, typeof ctx.body.age],
    }));

    const compiled = router.compile();
    const handler = (compiled["/users"] as Record<string, RouteHandler>).POST!;
    const req = new Request("http://localhost:3000/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Alice", age: "30" }),
    });
    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "Alice", age: 30, types: ["string", "number"] });
  });

  test("returns 400 for invalid JSON body", async () => {
    const router = createRouter();
    router.post("/users", {
      body: {
        name: { type: "string", required: true },
      },
    }, (ctx) => ctx.json({ name: ctx.body.name }));

    const compiled = router.compile();
    const handler = (compiled["/users"] as Record<string, RouteHandler>).POST!;
    const req = new Request("http://localhost:3000/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await handler(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
  });
});

describe("Router - formData schema", () => {
  test("parses and validates formData text fields", async () => {
    const router = createRouter();
    router.post("/upload", {
      formData: {
        title: { type: "string", required: true },
        count: { type: "int" },
      },
    }, (ctx) => ctx.json({
      title: ctx.formData.title,
      count: ctx.formData.count,
      types: [typeof ctx.formData.title, typeof ctx.formData.count],
    }));

    const compiled = router.compile();
    const handler = (compiled["/upload"] as Record<string, RouteHandler>).POST!;
    const formData = new FormData();
    formData.append("title", "hello");
    formData.append("count", "42");
    const req = new Request("http://localhost:3000/upload", {
      method: "POST",
      body: formData,
    });
    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ title: "hello", count: 42, types: ["string", "number"] });
  });

  test("formData schema does not consume body stream - handler can re-read request.formData()", async () => {
    const router = createRouter();
    router.post("/upload", {
      formData: {
        title: { type: "string", required: true },
      },
    }, async (ctx) => {
      // handler 里重新读取 formData 不应报错
      const formData = await ctx.request.formData();
      const file = formData.get("file") as File;
      return ctx.json({ title: ctx.formData.title, hasFile: file instanceof File, fileName: file?.name });
    });

    const compiled = router.compile();
    const handler = (compiled["/upload"] as Record<string, RouteHandler>).POST!;

    const formData = new FormData();
    formData.append("title", "hello");
    formData.append("file", new File(["content"], "test.txt", { type: "text/plain" }));
    const req = new Request("http://localhost:3000/upload", {
      method: "POST",
      body: formData,
    });
    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ title: "hello", hasFile: true, fileName: "test.txt" });
  });
});

describe("Router - headers schema", () => {
  test("validates headers by schema", async () => {
    const router = createRouter();
    router.get("/protected", {
      headers: {
        authorization: { type: "string", required: true },
      },
    }, (ctx) => ctx.json({ ok: true }));

    const compiled = router.compile();
    const handler = (compiled["/protected"] as Record<string, RouteHandler>).GET!;
    const req = new Request("http://localhost:3000/protected", {
      headers: { Authorization: "Bearer token123" },
    });
    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("returns 400 for missing required headers", async () => {
    const router = createRouter();
    router.get("/protected", {
      headers: {
        authorization: { type: "string", required: true },
      },
    }, (ctx) => ctx.json({ ok: true }));

    const compiled = router.compile();
    const handler = (compiled["/protected"] as Record<string, RouteHandler>).GET!;
    const req = new Request("http://localhost:3000/protected");
    const res = await handler(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
  });
});

describe("Router - response schema", () => {
  test("returns 500 when JSON response body does not match declared schema", async () => {
    const router = createRouter();
    router.get("/things", {
      query: {
        page: { type: "int", required: true, default: 1 },
        limit: { type: "int", default: 10 },
      },
      responses: {
        200: {
          page: { type: "int" },
          limit: { type: "string" },
        },
      },
    }, (ctx) =>
      ctx.json({
        page: ctx.query.page,
        // @ts-ignore 已知问题，故意这么测试的
        limit: ctx.query.limit,
      }),
    );

    const compiled = router.compile();
    const handler = (compiled["/things"] as Record<string, RouteHandler>).GET!;
    const req = new Request("http://localhost:3000/things?page=2");
    const res = await handler(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("RESPONSE_VALIDATION_ERROR");
    expect(body.errors).toContain("response.limit must be a string");
  });

  test("supports declared non-json text responses", async () => {
    const router = createRouter();
    router.get("/health", {
      responses: {
        200: {
          contentType: "text/plain",
          schema: { type: "string" },
        },
      },
    }, (ctx) => ctx.text("ok"));

    const compiled = router.compile();
    const handler = (compiled["/health"] as Record<string, RouteHandler>).GET!;
    const req = new Request("http://localhost:3000/health");
    const res = await handler(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(await res.text()).toBe("ok");
  });
});

describe("Router - merge preserves schemaConfig", () => {
  test("merged router keeps query schema validation", async () => {
    const sub = createRouter();
    sub.get("/items", {
      query: {
        page: { type: "int", required: true },
      },
    }, (ctx) => ctx.json({ page: ctx.query.page }));

    const main = createRouter();
    main.merge(sub);

    const compiled = main.compile();
    const handler = (compiled["/items"] as Record<string, RouteHandler>).GET!;

    const reqMissing = new Request("http://localhost:3000/items");
    const resMissing = await handler(reqMissing);
    expect(resMissing.status).toBe(400);

    const reqOk = new Request("http://localhost:3000/items?page=3");
    const resOk = await handler(reqOk);
    expect(resOk.status).toBe(200);
    expect(await resOk.json()).toEqual({ page: 3 });
  });
});

describe("Router - wildcard params", () => {
  test("captures wildcard path in ctx.params", async () => {
    const router = createRouter();
    router.get("/static/*", (ctx) => ctx.json({ path: ctx.params["*"] }));

    const compiled = router.compile();
    const handler = (compiled["/static/*"] as Record<string, RouteHandler>).GET!;

    // Simulate Bun not providing req.params for wildcard
    const req = new Request("http://localhost:3000/static/css/main.css");
    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ path: "css/main.css" });
  });

  test("handles wildcard with empty remainder", async () => {
    const router = createRouter();
    router.get("/static/*", (ctx) => ctx.json({ path: ctx.params["*"] }));

    const compiled = router.compile();
    const handler = (compiled["/static/*"] as Record<string, RouteHandler>).GET!;

    const req = new Request("http://localhost:3000/static/");
    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ path: "" });
  });

  test("uses req.params when Bun provides it", async () => {
    const router = createRouter();
    router.get("/files/*", (ctx) => ctx.json({ path: ctx.params["*"] }));

    const compiled = router.compile();
    const handler = (compiled["/files/*"] as Record<string, RouteHandler>).GET!;

    const req = new Request("http://localhost:3000/files/docs/readme.md");
    Object.defineProperty(req, "params", { value: { "*": "docs/readme.md" } });

    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ path: "docs/readme.md" });
  });
});

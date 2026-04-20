import { describe, test, expect } from "bun:test";
import { createRouter } from "../router";
import type { Middleware } from "../middleware";

describe("createRouter", () => {
  test("registers GET route", () => {
    const router = createRouter();
    const handler = async () => new Response("ok");
    router.get("/users", handler);

    const routes = router.routes();
    expect(routes).toHaveLength(1);
    expect(routes[0]!.method).toBe("GET");
    expect(routes[0]!.path).toBe("/users");
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
    const mw: Middleware = async (ctx, next) => {
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
    const routerMw: Middleware = async (ctx, next) => await next();
    const routeMw: Middleware = async (ctx, next) => await next();

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
    expect(routes[0]!.method).toBe("GET");
    expect(routes[1]!.method).toBe("POST");
  });

  test("group middleware applies to grouped routes", () => {
    const groupMw: Middleware = async (ctx, next) => await next();

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
  });

  test("sub-router middleware included in group routes", () => {
    const subMw: Middleware = async (ctx, next) => await next();
    const groupMw: Middleware = async (ctx, next) => await next();

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
    expect(typeof (compiled["/health"] as Record<string, unknown>)["GET"]).toBe(
      "function",
    );
    expect(
      typeof (compiled["/users"] as Record<string, unknown>)["POST"],
    ).toBe("function");
  });

  test("compiled handler creates context and returns response", async () => {
    const router = createRouter();
    router.get("/hello", (ctx) => ctx.json({ message: "hello" }));

    const compiled = router.compile();
    const handler = (compiled["/hello"] as Record<string, Function>)["GET"]!;

    const req = new Request("http://localhost:3000/hello");
    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "hello" });
  });

  test("compiled handler passes params from request", async () => {
    const router = createRouter();
    router.get("/users/:id", (ctx) => ctx.json({ id: ctx.params["id"] }));

    const compiled = router.compile();
    const handler = (compiled["/users/:id"] as Record<string, Function>)[
      "GET"
    ]!;

    // Simulate Bun.serve adding params to request
    const req = new Request("http://localhost:3000/users/42");
    Object.defineProperty(req, "params", { value: { id: "42" } });

    const res = await handler(req);
    expect(await res.json()).toEqual({ id: "42" });
  });

  test("compiled handler runs middleware", async () => {
    const calls: string[] = [];
    const mw: Middleware = async (ctx, next) => {
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
    const handler = (compiled["/test"] as Record<string, Function>)["GET"]!;
    await handler(new Request("http://localhost:3000/test"));

    expect(calls).toEqual(["mw", "handler"]);
  });

  test("compiled handler runs global middleware", async () => {
    const calls: string[] = [];
    const globalMw: Middleware = async (ctx, next) => {
      calls.push("global");
      return await next();
    };

    const router = createRouter();
    router.get("/test", (ctx) => {
      calls.push("handler");
      return ctx.text("ok");
    });

    const compiled = router.compile([globalMw]);
    const handler = (compiled["/test"] as Record<string, Function>)["GET"]!;
    await handler(new Request("http://localhost:3000/test"));

    expect(calls).toEqual(["global", "handler"]);
  });

  test("multiple methods on same path compile to method object", () => {
    const router = createRouter();
    router.get("/users", async (ctx) => ctx.json([]));
    router.post("/users", async (ctx) => ctx.json({ id: 1 }, 201));

    const compiled = router.compile();
    const methods = compiled["/users"] as Record<string, Function>;
    expect(typeof methods["GET"]).toBe("function");
    expect(typeof methods["POST"]).toBe("function");
  });

  test("handler without middleware skips compose", async () => {
    const router = createRouter();
    router.get("/fast", (ctx) => ctx.text("fast"));

    const compiled = router.compile();
    const handler = (compiled["/fast"] as Record<string, Function>)["GET"]!;
    const res = await handler(new Request("http://localhost:3000/fast"));
    expect(await res.text()).toBe("fast");
  });
});

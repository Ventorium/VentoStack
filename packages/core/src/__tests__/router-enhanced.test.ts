import { describe, test, expect } from "bun:test";
import { createRouter, type RouteHandler } from "../router";

const dummyHandler: RouteHandler = (ctx) => ctx.json({ ok: true });

describe("Router - resource()", () => {
  test("registers all CRUD routes", () => {
    const router = createRouter();
    router.resource("/users", {
      index: dummyHandler,
      show: dummyHandler,
      create: dummyHandler,
      update: dummyHandler,
      destroy: dummyHandler,
    });

    const routes = router.routes();
    expect(routes).toHaveLength(5);
    expect(routes[0]).toMatchObject({ method: "GET", path: "/users" });
    expect(routes[1]).toMatchObject({ method: "POST", path: "/users" });
    expect(routes[2]).toMatchObject({ method: "GET", path: "/users/:id" });
    expect(routes[3]).toMatchObject({ method: "PUT", path: "/users/:id" });
    expect(routes[4]).toMatchObject({ method: "DELETE", path: "/users/:id" });
  });

  test("registers only provided handlers", () => {
    const router = createRouter();
    router.resource("/posts", {
      index: dummyHandler,
      create: dummyHandler,
    });

    const routes = router.routes();
    expect(routes).toHaveLength(2);
    expect(routes[0]).toMatchObject({ method: "GET", path: "/posts" });
    expect(routes[1]).toMatchObject({ method: "POST", path: "/posts" });
  });

  test("applies middleware to resource routes", () => {
    const mw = async (_ctx: unknown, next: () => Promise<Response>) => next();
    const router = createRouter();
    router.resource("/items", { index: dummyHandler }, mw as never);

    const routes = router.routes();
    expect(routes[0]!.middleware).toHaveLength(1);
  });

  test("returns router for chaining", () => {
    const router = createRouter();
    const result = router.resource("/users", { index: dummyHandler });
    expect(result).toBe(router);
  });
});

describe("Router - namedRoute() & url()", () => {
  test("registers a named route", () => {
    const router = createRouter();
    router.namedRoute("user.show", "GET", "/users/:id", dummyHandler);

    const routes = router.routes();
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({ method: "GET", path: "/users/:id" });
  });

  test("url() returns path without params", () => {
    const router = createRouter();
    router.namedRoute("home", "GET", "/", dummyHandler);
    expect(router.url("home")).toBe("/");
  });

  test("url() substitutes params", () => {
    const router = createRouter();
    router.namedRoute("user.show", "GET", "/users/:id", dummyHandler);
    expect(router.url("user.show", { id: "42" })).toBe("/users/42");
  });

  test("url() substitutes multiple params", () => {
    const router = createRouter();
    router.namedRoute(
      "post.comment",
      "GET",
      "/posts/:postId/comments/:commentId",
      dummyHandler,
    );
    expect(
      router.url("post.comment", { postId: "1", commentId: "2" }),
    ).toBe("/posts/1/comments/2");
  });

  test("url() throws for unknown name", () => {
    const router = createRouter();
    expect(() => router.url("nonexistent")).toThrow(
      'Route name "nonexistent" not found',
    );
  });

  test("namedRoute() throws on duplicate name", () => {
    const router = createRouter();
    router.namedRoute("home", "GET", "/", dummyHandler);
    expect(() =>
      router.namedRoute("home", "GET", "/other", dummyHandler),
    ).toThrow('Route name "home" is already registered');
  });

  test("namedRoute() applies middleware", () => {
    const mw = async (_ctx: unknown, next: () => Promise<Response>) => next();
    const router = createRouter();
    router.namedRoute("test", "GET", "/test", dummyHandler, mw as never);

    const routes = router.routes();
    expect(routes[0]!.middleware).toHaveLength(1);
  });

  test("namedRoute() returns router for chaining", () => {
    const router = createRouter();
    const result = router.namedRoute("home", "GET", "/", dummyHandler);
    expect(result).toBe(router);
  });
});

describe("Router - compile() conflict detection", () => {
  test("throws on duplicate method+path", () => {
    const router = createRouter();
    router.get("/users", dummyHandler);
    router.get("/users", dummyHandler);

    expect(() => router.compile()).toThrow(
      "Duplicate route detected: GET /users",
    );
  });

  test("allows same path with different methods", () => {
    const router = createRouter();
    router.get("/users", dummyHandler);
    router.post("/users", dummyHandler);

    expect(() => router.compile()).not.toThrow();
  });

  test("allows same method with different paths", () => {
    const router = createRouter();
    router.get("/users", dummyHandler);
    router.get("/posts", dummyHandler);

    expect(() => router.compile()).not.toThrow();
  });

  test("detects conflicts from resource expansion", () => {
    const router = createRouter();
    router.get("/users", dummyHandler);
    router.resource("/users", { index: dummyHandler });

    expect(() => router.compile()).toThrow(
      "Duplicate route detected: GET /users",
    );
  });

  test("detects conflicts from group expansion", () => {
    const router = createRouter();
    router.get("/api/users", dummyHandler);
    router.group("/api", (g) => {
      g.get("/users", dummyHandler);
    });

    expect(() => router.compile()).toThrow(
      "Duplicate route detected: GET /api/users",
    );
  });
});

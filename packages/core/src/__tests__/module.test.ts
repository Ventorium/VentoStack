import { describe, test, expect, mock } from "bun:test";
import { defineModule, createModuleRegistry } from "../module";
import { createRouter } from "../router";

describe("defineModule()", () => {
  test("returns the same definition object", () => {
    const def = { name: "test" };
    const result = defineModule(def);
    expect(result).toBe(def);
  });

  test("preserves all fields", () => {
    const onInit = mock(() => {});
    const def = defineModule({
      name: "auth",
      disabled: false,
      services: { key: "value" },
      onInit,
    });
    expect(def.name).toBe("auth");
    expect(def.disabled).toBe(false);
    expect(def.services).toEqual({ key: "value" });
    expect(def.onInit).toBe(onInit);
  });
});

describe("createModuleRegistry()", () => {
  describe("register()", () => {
    test("registers a module", () => {
      const registry = createModuleRegistry();
      registry.register(defineModule({ name: "auth" }));
      expect(registry.listModules()).toHaveLength(1);
    });

    test("skips disabled modules", () => {
      const registry = createModuleRegistry();
      registry.register(defineModule({ name: "disabled", disabled: true }));
      expect(registry.listModules()).toHaveLength(0);
    });

    test("throws on duplicate module name", () => {
      const registry = createModuleRegistry();
      registry.register(defineModule({ name: "auth" }));
      expect(() =>
        registry.register(defineModule({ name: "auth" })),
      ).toThrow('Module "auth" is already registered');
    });
  });

  describe("getModule()", () => {
    test("returns registered module", () => {
      const registry = createModuleRegistry();
      const mod = defineModule({ name: "auth" });
      registry.register(mod);
      expect(registry.getModule("auth")).toBe(mod);
    });

    test("returns undefined for unregistered module", () => {
      const registry = createModuleRegistry();
      expect(registry.getModule("nonexistent")).toBeUndefined();
    });

    test("returns undefined for disabled module", () => {
      const registry = createModuleRegistry();
      registry.register(defineModule({ name: "off", disabled: true }));
      expect(registry.getModule("off")).toBeUndefined();
    });
  });

  describe("listModules()", () => {
    test("returns all registered modules", () => {
      const registry = createModuleRegistry();
      registry.register(defineModule({ name: "a" }));
      registry.register(defineModule({ name: "b" }));
      const list = registry.listModules();
      expect(list).toHaveLength(2);
      expect(list[0]!.name).toBe("a");
      expect(list[1]!.name).toBe("b");
    });

    test("returns a copy", () => {
      const registry = createModuleRegistry();
      registry.register(defineModule({ name: "a" }));
      const list = registry.listModules();
      list.push(defineModule({ name: "b" }));
      expect(registry.listModules()).toHaveLength(1);
    });
  });

  describe("initAll()", () => {
    test("calls onInit in registration order", async () => {
      const order: string[] = [];
      const registry = createModuleRegistry();
      registry.register(
        defineModule({ name: "a", onInit: () => { order.push("a"); } }),
      );
      registry.register(
        defineModule({ name: "b", onInit: () => { order.push("b"); } }),
      );

      await registry.initAll();
      expect(order).toEqual(["a", "b"]);
    });

    test("handles async onInit", async () => {
      const order: string[] = [];
      const registry = createModuleRegistry();
      registry.register(
        defineModule({
          name: "async",
          onInit: async () => {
            await Promise.resolve();
            order.push("async");
          },
        }),
      );

      await registry.initAll();
      expect(order).toEqual(["async"]);
    });

    test("skips modules without onInit", async () => {
      const registry = createModuleRegistry();
      registry.register(defineModule({ name: "no-init" }));
      await expect(registry.initAll()).resolves.toBeUndefined();
    });
  });

  describe("destroyAll()", () => {
    test("calls onDestroy in reverse order", async () => {
      const order: string[] = [];
      const registry = createModuleRegistry();
      registry.register(
        defineModule({ name: "a", onDestroy: () => { order.push("a"); } }),
      );
      registry.register(
        defineModule({ name: "b", onDestroy: () => { order.push("b"); } }),
      );
      registry.register(
        defineModule({ name: "c", onDestroy: () => { order.push("c"); } }),
      );

      await registry.destroyAll();
      expect(order).toEqual(["c", "b", "a"]);
    });

    test("handles async onDestroy", async () => {
      const order: string[] = [];
      const registry = createModuleRegistry();
      registry.register(
        defineModule({
          name: "async",
          onDestroy: async () => {
            await Promise.resolve();
            order.push("async");
          },
        }),
      );

      await registry.destroyAll();
      expect(order).toEqual(["async"]);
    });

    test("skips modules without onDestroy", async () => {
      const registry = createModuleRegistry();
      registry.register(defineModule({ name: "no-destroy" }));
      await expect(registry.destroyAll()).resolves.toBeUndefined();
    });
  });

  describe("applyRoutes()", () => {
    test("applies module routes to router", () => {
      const registry = createModuleRegistry();
      registry.register(
        defineModule({
          name: "users",
          routes: (r) => {
            r.get("/users", (ctx) => ctx.json([]));
          },
        }),
      );

      const router = createRouter();
      registry.applyRoutes(router);

      const routes = router.routes();
      expect(routes).toHaveLength(1);
      expect(routes[0]).toMatchObject({ method: "GET", path: "/users" });
    });

    test("applies routes from multiple modules", () => {
      const registry = createModuleRegistry();
      registry.register(
        defineModule({
          name: "users",
          routes: (r) => { r.get("/users", (ctx) => ctx.json([])); },
        }),
      );
      registry.register(
        defineModule({
          name: "posts",
          routes: (r) => { r.get("/posts", (ctx) => ctx.json([])); },
        }),
      );

      const router = createRouter();
      registry.applyRoutes(router);

      expect(router.routes()).toHaveLength(2);
    });

    test("skips modules without routes", () => {
      const registry = createModuleRegistry();
      registry.register(defineModule({ name: "no-routes" }));

      const router = createRouter();
      registry.applyRoutes(router);

      expect(router.routes()).toHaveLength(0);
    });
  });
});

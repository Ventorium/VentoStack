import { describe, expect, test } from "bun:test";
import { createDomainEventRegistry } from "../domain-events";
import type { DomainEvent } from "../domain-events";

describe("createDomainEventRegistry", () => {
  test("register and trigger a handler", async () => {
    const registry = createDomainEventRegistry();
    const events: DomainEvent<{ name: string }>[] = [];

    registry.register<{ name: string }>("User", "afterCreate", (event) => {
      events.push(event);
    });

    await registry.trigger("User", "afterCreate", { name: "Alice" });

    expect(events).toHaveLength(1);
    expect(events[0]!.entity).toBe("User");
    expect(events[0]!.type).toBe("afterCreate");
    expect(events[0]!.payload).toEqual({ name: "Alice" });
    expect(events[0]!.timestamp).toBeNumber();
  });

  test("register returns an unsubscribe function", async () => {
    const registry = createDomainEventRegistry();
    let count = 0;

    const unsub = registry.register("Order", "beforeDelete", () => {
      count++;
    });

    await registry.trigger("Order", "beforeDelete", {});
    expect(count).toBe(1);

    unsub();
    await registry.trigger("Order", "beforeDelete", {});
    expect(count).toBe(1);
  });

  test("trigger executes handlers in order", async () => {
    const registry = createDomainEventRegistry();
    const order: number[] = [];

    registry.register("Item", "beforeUpdate", async () => {
      order.push(1);
    });
    registry.register("Item", "beforeUpdate", async () => {
      order.push(2);
    });
    registry.register("Item", "beforeUpdate", async () => {
      order.push(3);
    });

    await registry.trigger("Item", "beforeUpdate", {});

    expect(order).toEqual([1, 2, 3]);
  });

  test("trigger throws AggregateError when handlers fail", async () => {
    const registry = createDomainEventRegistry();

    registry.register("X", "afterUpdate", () => {
      throw new Error("err1");
    });
    registry.register("X", "afterUpdate", () => {
      throw new Error("err2");
    });

    try {
      await registry.trigger("X", "afterUpdate", {});
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AggregateError);
      expect((err as AggregateError).errors).toHaveLength(2);
    }
  });

  test("trigger does nothing when no handlers are registered", async () => {
    const registry = createDomainEventRegistry();
    // Should not throw
    await registry.trigger("Ghost", "beforeCreate", {});
  });

  test("listHandlers counts by entity", () => {
    const registry = createDomainEventRegistry();

    registry.register("User", "afterCreate", () => {});
    registry.register("User", "beforeDelete", () => {});
    registry.register("Order", "afterCreate", () => {});

    expect(registry.listHandlers("User")).toBe(2);
    expect(registry.listHandlers("Order")).toBe(1);
    expect(registry.listHandlers("None")).toBe(0);
  });

  test("listHandlers counts by entity and type", () => {
    const registry = createDomainEventRegistry();

    registry.register("User", "afterCreate", () => {});
    registry.register("User", "afterCreate", () => {});
    registry.register("User", "beforeDelete", () => {});

    expect(registry.listHandlers("User", "afterCreate")).toBe(2);
    expect(registry.listHandlers("User", "beforeDelete")).toBe(1);
    expect(registry.listHandlers("User", "afterUpdate")).toBe(0);
  });

  test("removeAll clears all handlers", () => {
    const registry = createDomainEventRegistry();

    registry.register("A", "afterCreate", () => {});
    registry.register("B", "beforeUpdate", () => {});

    registry.removeAll();

    expect(registry.listHandlers("A")).toBe(0);
    expect(registry.listHandlers("B")).toBe(0);
  });

  test("removeAll with entity clears only that entity", () => {
    const registry = createDomainEventRegistry();

    registry.register("User", "afterCreate", () => {});
    registry.register("User", "beforeDelete", () => {});
    registry.register("Order", "afterCreate", () => {});

    registry.removeAll("User");

    expect(registry.listHandlers("User")).toBe(0);
    expect(registry.listHandlers("Order")).toBe(1);
  });

  test("async handlers are awaited", async () => {
    const registry = createDomainEventRegistry();
    const results: string[] = [];

    registry.register("Async", "afterCreate", async () => {
      await Bun.sleep(10);
      results.push("first");
    });
    registry.register("Async", "afterCreate", async () => {
      results.push("second");
    });

    await registry.trigger("Async", "afterCreate", {});

    expect(results).toEqual(["first", "second"]);
  });
});

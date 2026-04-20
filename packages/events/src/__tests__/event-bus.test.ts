import { describe, test, expect, beforeEach } from "bun:test";
import { createEventBus, defineEvent } from "../event-bus";

describe("defineEvent", () => {
  test("creates an event definition with the given name", () => {
    const event = defineEvent<string>("user:created");
    expect(event.name).toBe("user:created");
  });
});

describe("EventBus", () => {
  let bus: ReturnType<typeof createEventBus>;

  beforeEach(() => {
    bus = createEventBus();
  });

  describe("on / emit", () => {
    test("handler receives the emitted payload", async () => {
      const event = defineEvent<number>("test");
      let received: number | undefined;
      bus.on(event, (payload) => {
        received = payload;
      });
      await bus.emit(event, 42);
      expect(received).toBe(42);
    });

    test("multiple handlers execute in registration order", async () => {
      const event = defineEvent<void>("order");
      const order: number[] = [];
      bus.on(event, () => {
        order.push(1);
      });
      bus.on(event, () => {
        order.push(2);
      });
      bus.on(event, () => {
        order.push(3);
      });
      await bus.emit(event, undefined);
      expect(order).toEqual([1, 2, 3]);
    });

    test("async handlers are awaited in sequence", async () => {
      const event = defineEvent<void>("async");
      const order: number[] = [];
      bus.on(event, async () => {
        await Bun.sleep(10);
        order.push(1);
      });
      bus.on(event, () => {
        order.push(2);
      });
      await bus.emit(event, undefined);
      expect(order).toEqual([1, 2]);
    });

    test("emitting an event with no listeners is a no-op", async () => {
      const event = defineEvent<void>("noop");
      await bus.emit(event, undefined); // should not throw
    });
  });

  describe("on returns unsubscribe function", () => {
    test("unsubscribe removes the handler", async () => {
      const event = defineEvent<void>("unsub");
      let called = false;
      const unsub = bus.on(event, () => {
        called = true;
      });
      unsub();
      await bus.emit(event, undefined);
      expect(called).toBe(false);
    });
  });

  describe("once", () => {
    test("handler fires only once", async () => {
      const event = defineEvent<void>("once");
      let count = 0;
      bus.once(event, () => {
        count++;
      });
      await bus.emit(event, undefined);
      await bus.emit(event, undefined);
      expect(count).toBe(1);
    });

    test("once returns unsubscribe function that prevents execution", async () => {
      const event = defineEvent<void>("once-unsub");
      let called = false;
      const unsub = bus.once(event, () => {
        called = true;
      });
      unsub();
      await bus.emit(event, undefined);
      expect(called).toBe(false);
    });
  });

  describe("off", () => {
    test("removes a specific handler", async () => {
      const event = defineEvent<void>("off-specific");
      let a = 0;
      let b = 0;
      const handlerA = () => {
        a++;
      };
      const handlerB = () => {
        b++;
      };
      bus.on(event, handlerA);
      bus.on(event, handlerB);
      bus.off(event, handlerA);
      await bus.emit(event, undefined);
      expect(a).toBe(0);
      expect(b).toBe(1);
    });

    test("removes all handlers when no handler is specified", async () => {
      const event = defineEvent<void>("off-all");
      let count = 0;
      bus.on(event, () => {
        count++;
      });
      bus.on(event, () => {
        count++;
      });
      bus.off(event);
      await bus.emit(event, undefined);
      expect(count).toBe(0);
    });

    test("off on non-existent event is a no-op", () => {
      const event = defineEvent<void>("ghost");
      bus.off(event); // should not throw
      bus.off(event, () => {}); // should not throw
    });
  });

  describe("removeAll", () => {
    test("clears all events and handlers", async () => {
      const e1 = defineEvent<void>("e1");
      const e2 = defineEvent<void>("e2");
      let count = 0;
      bus.on(e1, () => {
        count++;
      });
      bus.on(e2, () => {
        count++;
      });
      bus.removeAll();
      await bus.emit(e1, undefined);
      await bus.emit(e2, undefined);
      expect(count).toBe(0);
    });
  });

  describe("listenerCount", () => {
    test("returns 0 for events with no listeners", () => {
      const event = defineEvent<void>("empty");
      expect(bus.listenerCount(event)).toBe(0);
    });

    test("returns correct count after on/off", () => {
      const event = defineEvent<void>("count");
      const h1 = () => {};
      const h2 = () => {};
      bus.on(event, h1);
      bus.on(event, h2);
      expect(bus.listenerCount(event)).toBe(2);
      bus.off(event, h1);
      expect(bus.listenerCount(event)).toBe(1);
      bus.off(event, h2);
      expect(bus.listenerCount(event)).toBe(0);
    });
  });

  describe("error handling", () => {
    test("collects errors from multiple handlers into AggregateError", async () => {
      const event = defineEvent<void>("errors");
      bus.on(event, () => {
        throw new Error("fail-1");
      });
      bus.on(event, () => {
        throw new Error("fail-2");
      });

      try {
        await bus.emit(event, undefined);
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(AggregateError);
        const agg = err as AggregateError;
        expect(agg.errors).toHaveLength(2);
        expect((agg.errors[0] as Error).message).toBe("fail-1");
        expect((agg.errors[1] as Error).message).toBe("fail-2");
      }
    });

    test("successful handlers still execute when one throws", async () => {
      const event = defineEvent<void>("partial-fail");
      const order: number[] = [];
      bus.on(event, () => {
        order.push(1);
      });
      bus.on(event, () => {
        throw new Error("boom");
      });
      bus.on(event, () => {
        order.push(3);
      });

      try {
        await bus.emit(event, undefined);
      } catch {
        // expected
      }
      expect(order).toEqual([1, 3]);
    });

    test("no error thrown when all handlers succeed", async () => {
      const event = defineEvent<void>("ok");
      bus.on(event, () => {});
      await bus.emit(event, undefined); // should not throw
    });
  });
});

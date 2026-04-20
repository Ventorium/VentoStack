import { describe, expect, test } from "bun:test";
import { createMemoryEventStore } from "../event-sourcing";

describe("createMemoryEventStore", () => {
  test("append stores events with incrementing versions", async () => {
    const store = createMemoryEventStore();

    const events = await store.append("agg-1", "Order", [
      { eventType: "OrderCreated", payload: { total: 100 } },
      { eventType: "ItemAdded", payload: { item: "widget" } },
    ], 0);

    expect(events).toHaveLength(2);
    expect(events[0]!.version).toBe(1);
    expect(events[1]!.version).toBe(2);
    expect(events[0]!.eventType).toBe("OrderCreated");
    expect(events[0]!.aggregateId).toBe("agg-1");
    expect(events[0]!.aggregateType).toBe("Order");
    expect(events[0]!.id).toBeString();
    expect(events[0]!.timestamp).toBeNumber();
  });

  test("append throws on version conflict (optimistic concurrency)", async () => {
    const store = createMemoryEventStore();

    await store.append("agg-1", "Order", [
      { eventType: "Created", payload: {} },
    ], 0);

    try {
      await store.append("agg-1", "Order", [
        { eventType: "Updated", payload: {} },
      ], 0); // wrong expected version — should be 1
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain("Concurrency conflict");
      expect((err as Error).message).toContain("expected version 0");
      expect((err as Error).message).toContain("current version is 1");
    }
  });

  test("getEvents returns all events for an aggregate", async () => {
    const store = createMemoryEventStore();

    await store.append("a1", "T", [{ eventType: "E1", payload: 1 }], 0);
    await store.append("a1", "T", [{ eventType: "E2", payload: 2 }], 1);

    const events = await store.getEvents("a1");
    expect(events).toHaveLength(2);
    expect(events[0]!.payload).toBe(1);
    expect(events[1]!.payload).toBe(2);
  });

  test("getEvents with fromVersion filters events", async () => {
    const store = createMemoryEventStore();

    await store.append("a1", "T", [
      { eventType: "E1", payload: "v1" },
      { eventType: "E2", payload: "v2" },
      { eventType: "E3", payload: "v3" },
    ], 0);

    const events = await store.getEvents("a1", 2);
    expect(events).toHaveLength(2);
    expect(events[0]!.version).toBe(2);
    expect(events[1]!.version).toBe(3);
  });

  test("getEvents returns empty array for unknown aggregate", async () => {
    const store = createMemoryEventStore();
    const events = await store.getEvents("nonexistent");
    expect(events).toEqual([]);
  });

  test("getLatestVersion returns current version", async () => {
    const store = createMemoryEventStore();

    expect(await store.getLatestVersion("a1")).toBe(0);

    await store.append("a1", "T", [{ eventType: "E", payload: {} }], 0);
    expect(await store.getLatestVersion("a1")).toBe(1);

    await store.append("a1", "T", [
      { eventType: "E", payload: {} },
      { eventType: "E", payload: {} },
    ], 1);
    expect(await store.getLatestVersion("a1")).toBe(3);
  });

  test("saveSnapshot and getSnapshot", async () => {
    const store = createMemoryEventStore();

    expect(await store.getSnapshot("a1")).toBeNull();

    await store.saveSnapshot("a1", { total: 500 }, 5);
    const snap = await store.getSnapshot("a1");

    expect(snap).not.toBeNull();
    expect(snap!.state).toEqual({ total: 500 });
    expect(snap!.version).toBe(5);
  });

  test("saveSnapshot overwrites previous snapshot", async () => {
    const store = createMemoryEventStore();

    await store.saveSnapshot("a1", { v: 1 }, 1);
    await store.saveSnapshot("a1", { v: 2 }, 2);

    const snap = await store.getSnapshot("a1");
    expect(snap!.state).toEqual({ v: 2 });
    expect(snap!.version).toBe(2);
  });

  test("append stores metadata when provided", async () => {
    const store = createMemoryEventStore();

    const events = await store.append("a1", "T", [
      { eventType: "E1", payload: {}, metadata: { userId: "u1", source: "api" } },
    ], 0);

    expect(events[0]!.metadata).toEqual({ userId: "u1", source: "api" });
  });

  test("multiple aggregates are independent", async () => {
    const store = createMemoryEventStore();

    await store.append("a1", "Order", [{ eventType: "Created", payload: "order1" }], 0);
    await store.append("a2", "User", [{ eventType: "Registered", payload: "user1" }], 0);

    const a1Events = await store.getEvents("a1");
    const a2Events = await store.getEvents("a2");

    expect(a1Events).toHaveLength(1);
    expect(a1Events[0]!.aggregateType).toBe("Order");
    expect(a2Events).toHaveLength(1);
    expect(a2Events[0]!.aggregateType).toBe("User");

    expect(await store.getLatestVersion("a1")).toBe(1);
    expect(await store.getLatestVersion("a2")).toBe(1);
  });
});

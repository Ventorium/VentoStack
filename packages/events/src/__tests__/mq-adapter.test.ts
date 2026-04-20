import { describe, test, expect, beforeEach } from "bun:test";
import { createMemoryMQAdapter, createMQAdapterFactory } from "../mq-adapter";

describe("createMemoryMQAdapter", () => {
  let adapter: ReturnType<typeof createMemoryMQAdapter>;

  beforeEach(() => {
    adapter = createMemoryMQAdapter();
  });

  test("has name 'memory'", () => {
    expect(adapter.name).toBe("memory");
  });

  test("is not connected initially", () => {
    expect(adapter.isConnected()).toBe(false);
  });

  test("connects and disconnects", async () => {
    await adapter.connect();
    expect(adapter.isConnected()).toBe(true);
    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
  });

  test("publish throws if not connected", async () => {
    await expect(adapter.publish("topic", { body: "hello" })).rejects.toThrow("not connected");
  });

  test("subscribe throws if not connected", async () => {
    await expect(adapter.subscribe("topic", async () => {})).rejects.toThrow("not connected");
  });

  test("publish delivers to subscriber", async () => {
    await adapter.connect();
    let received: unknown;
    await adapter.subscribe("test", async (msg) => {
      received = msg.body;
    });
    await adapter.publish("test", { body: "hello" });
    expect(received).toBe("hello");
  });

  test("publish assigns id and timestamp", async () => {
    await adapter.connect();
    let msg: { id?: string; timestamp?: number } = {};
    await adapter.subscribe("test", async (m) => {
      msg = m;
    });
    await adapter.publish("test", { body: "data" });
    expect(msg.id).toBeDefined();
    expect(msg.timestamp).toBeGreaterThan(0);
  });

  test("unsubscribe stops delivery", async () => {
    await adapter.connect();
    let count = 0;
    const unsub = await adapter.subscribe("test", async () => { count++; });
    await adapter.publish("test", { body: "a" });
    expect(count).toBe(1);
    unsub();
    await adapter.publish("test", { body: "b" });
    expect(count).toBe(1);
  });

  test("multiple subscribers on same topic", async () => {
    await adapter.connect();
    let count = 0;
    await adapter.subscribe("test", async () => { count++; });
    await adapter.subscribe("test", async () => { count++; });
    await adapter.publish("test", { body: "x" });
    expect(count).toBe(2);
  });

  test("disconnect clears subscribers", async () => {
    await adapter.connect();
    let count = 0;
    await adapter.subscribe("test", async () => { count++; });
    await adapter.disconnect();
    await adapter.connect();
    await adapter.publish("test", { body: "x" });
    expect(count).toBe(0);
  });

  test("preserves custom message id", async () => {
    await adapter.connect();
    let receivedId: string | undefined;
    await adapter.subscribe("test", async (m) => { receivedId = m.id; });
    await adapter.publish("test", { id: "custom-id", body: "x" });
    expect(receivedId).toBe("custom-id");
  });
});

describe("createMQAdapterFactory", () => {
  test("creates memory adapter by default", () => {
    const factory = createMQAdapterFactory();
    const adapter = factory.create({ type: "memory" });
    expect(adapter.name).toBe("memory");
  });

  test("throws for unknown type", () => {
    const factory = createMQAdapterFactory();
    expect(() => factory.create({ type: "kafka" })).toThrow("Unknown MQ adapter type");
  });

  test("registers custom adapter", () => {
    const factory = createMQAdapterFactory();
    factory.register("custom", () => ({
      name: "custom",
      connect: async () => {},
      disconnect: async () => {},
      publish: async () => {},
      subscribe: async () => () => {},
      isConnected: () => true,
    }));
    const adapter = factory.create({ type: "custom" as "memory" });
    expect(adapter.name).toBe("custom");
  });
});

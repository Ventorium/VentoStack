import { describe, test, expect } from "bun:test";
import { createReliableDelivery } from "../reliable-delivery";

describe("createReliableDelivery", () => {
  test("send creates message and marks as sent on success", async () => {
    const sent: unknown[] = [];
    const rd = createReliableDelivery(async (_topic, body) => { sent.push(body); });
    const id = await rd.send("test", { data: 1 });
    expect(id).toBeDefined();
    expect(sent).toEqual([{ data: 1 }]);
    expect(rd.stats().sent).toBe(1);
  });

  test("send marks as failed on error", async () => {
    const rd = createReliableDelivery(async () => { throw new Error("fail"); });
    await rd.send("test", "data");
    expect(rd.stats().failed).toBe(1);
    expect(rd.getFailed()).toHaveLength(1);
    expect(rd.getFailed()[0].error).toBe("fail");
  });

  test("ack transitions message to acked", async () => {
    const rd = createReliableDelivery(async () => {});
    const id = await rd.send("test", "data");
    expect(rd.ack(id)).toBe(true);
    expect(rd.stats().acked).toBe(1);
  });

  test("ack returns false for unknown id", () => {
    const rd = createReliableDelivery(async () => {});
    expect(rd.ack("nonexistent")).toBe(false);
  });

  test("ack returns false if already acked", async () => {
    const rd = createReliableDelivery(async () => {});
    const id = await rd.send("test", "data");
    rd.ack(id);
    expect(rd.ack(id)).toBe(false);
  });

  test("nack marks message as failed", async () => {
    const rd = createReliableDelivery(async () => {});
    const id = await rd.send("test", "data");
    expect(rd.nack(id, "bad data")).toBe(true);
    expect(rd.getFailed()[0].error).toBe("bad data");
  });

  test("nack returns false for unknown id", () => {
    const rd = createReliableDelivery(async () => {});
    expect(rd.nack("nonexistent")).toBe(false);
  });

  test("retry resends failed messages", async () => {
    let attempt = 0;
    const rd = createReliableDelivery(async () => {
      attempt++;
      if (attempt === 1) throw new Error("first fail");
    });
    await rd.send("test", "data");
    expect(rd.stats().failed).toBe(1);
    const retried = await rd.retry();
    expect(retried).toBe(1);
    expect(rd.stats().sent).toBe(1);
  });

  test("message moves to dead after max attempts", async () => {
    const rd = createReliableDelivery(async () => { throw new Error("always fail"); }, { maxAttempts: 2 });
    await rd.send("test", "data"); // attempt 1
    await rd.retry(); // attempt 2 → dead
    expect(rd.stats().dead).toBe(1);
    expect(rd.getDead()).toHaveLength(1);
  });

  test("getPending returns pending and sent", async () => {
    const rd = createReliableDelivery(async () => {});
    await rd.send("test", "a");
    await rd.send("test", "b");
    expect(rd.getPending()).toHaveLength(2);
  });

  test("stats aggregates all statuses", async () => {
    const rd = createReliableDelivery(async () => {});
    await rd.send("test", "a");
    const id = await rd.send("test", "b");
    rd.ack(id);
    const stats = rd.stats();
    expect(stats.sent).toBe(1);
    expect(stats.acked).toBe(1);
  });
});

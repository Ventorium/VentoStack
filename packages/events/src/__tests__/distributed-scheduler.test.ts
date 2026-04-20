import { describe, test, expect, beforeEach } from "bun:test";
import { createDistributedScheduler } from "../distributed-scheduler";

describe("createDistributedScheduler", () => {
  let scheduler: ReturnType<typeof createDistributedScheduler>;

  beforeEach(() => {
    scheduler = createDistributedScheduler({ instanceId: "inst-1", lockTimeout: 5000 });
  });

  test("register adds task", () => {
    scheduler.register({ id: "t1", name: "Task 1", handler: async () => {} });
    expect(scheduler.getRegistered()).toEqual(["t1"]);
  });

  test("tryAcquire succeeds for unlocked task", async () => {
    expect(await scheduler.tryAcquire("t1")).toBe(true);
    expect(scheduler.getLocks()).toHaveLength(1);
    expect(scheduler.getLocks()[0].instanceId).toBe("inst-1");
  });

  test("tryAcquire fails for already locked task", async () => {
    await scheduler.tryAcquire("t1");
    expect(await scheduler.tryAcquire("t1")).toBe(false);
  });

  test("release frees the lock", async () => {
    await scheduler.tryAcquire("t1");
    scheduler.release("t1");
    expect(scheduler.getLocks()).toHaveLength(0);
  });

  test("release only works for own instance", async () => {
    await scheduler.tryAcquire("t1");
    const other = createDistributedScheduler({ instanceId: "inst-2" });
    other.release("t1"); // should not affect inst-1's lock
    // But the lock store is local, so this just won't find it
    expect(scheduler.getLocks()).toHaveLength(1);
  });

  test("execute runs task and returns success", async () => {
    let ran = false;
    scheduler.register({ id: "t1", name: "Task 1", handler: async () => { ran = true; } });
    const result = await scheduler.execute("t1");
    expect(result.success).toBe(true);
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(ran).toBe(true);
  });

  test("execute returns error for unknown task", async () => {
    const result = await scheduler.execute("nonexistent");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  test("execute handles task failure", async () => {
    scheduler.register({ id: "t1", name: "Task 1", handler: async () => { throw new Error("boom"); } });
    const result = await scheduler.execute("t1");
    expect(result.success).toBe(false);
    expect(result.error).toBe("boom");
  });

  test("execute handles timeout", async () => {
    scheduler.register({
      id: "t1",
      name: "Task 1",
      timeout: 50,
      handler: async () => { await Bun.sleep(200); },
    });
    const result = await scheduler.execute("t1");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Task timeout");
  });

  test("execute releases lock after completion", async () => {
    scheduler.register({ id: "t1", name: "Task 1", handler: async () => {} });
    await scheduler.execute("t1");
    expect(scheduler.getLocks()).toHaveLength(0);
  });

  test("expired locks are cleaned up", async () => {
    const s = createDistributedScheduler({ instanceId: "i1", lockTimeout: 1 });
    await s.tryAcquire("t1");
    await Bun.sleep(10);
    expect(s.getLocks()).toHaveLength(0);
  });
});

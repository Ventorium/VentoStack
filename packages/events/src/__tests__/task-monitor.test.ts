import { describe, test, expect, beforeEach } from "bun:test";
import { createTaskMonitor } from "../task-monitor";

describe("createTaskMonitor", () => {
  let monitor: ReturnType<typeof createTaskMonitor>;

  beforeEach(() => {
    monitor = createTaskMonitor();
  });

  test("track creates pending task", () => {
    monitor.track("t1", "Test Task");
    const task = monitor.get("t1");
    expect(task).toBeDefined();
    expect(task!.status).toBe("pending");
    expect(task!.name).toBe("Test Task");
    expect(task!.attempts).toBe(0);
  });

  test("start sets status to running", () => {
    monitor.track("t1", "Task");
    monitor.start("t1");
    const task = monitor.get("t1")!;
    expect(task.status).toBe("running");
    expect(task.startedAt).toBeGreaterThan(0);
    expect(task.attempts).toBe(1);
  });

  test("complete sets status and duration", () => {
    monitor.track("t1", "Task");
    monitor.start("t1");
    monitor.complete("t1");
    const task = monitor.get("t1")!;
    expect(task.status).toBe("completed");
    expect(task.completedAt).toBeGreaterThan(0);
    expect(task.duration).toBeGreaterThanOrEqual(0);
  });

  test("fail sets error message", () => {
    monitor.track("t1", "Task");
    monitor.start("t1");
    monitor.fail("t1", "something went wrong");
    const task = monitor.get("t1")!;
    expect(task.status).toBe("failed");
    expect(task.error).toBe("something went wrong");
  });

  test("retry sets status to retrying", () => {
    monitor.track("t1", "Task");
    monitor.start("t1");
    monitor.fail("t1", "err");
    monitor.retry("t1");
    expect(monitor.get("t1")!.status).toBe("retrying");
  });

  test("log adds entries to task", () => {
    monitor.track("t1", "Task");
    monitor.log("t1", "info", "starting");
    monitor.log("t1", "warn", "slow", { ms: 500 });
    const task = monitor.get("t1")!;
    expect(task.logs).toHaveLength(2);
    expect(task.logs[0].message).toBe("starting");
    expect(task.logs[1].meta).toEqual({ ms: 500 });
  });

  test("list returns all tasks", () => {
    monitor.track("t1", "Task A");
    monitor.track("t2", "Task B");
    expect(monitor.list()).toHaveLength(2);
  });

  test("list filters by status", () => {
    monitor.track("t1", "Task A");
    monitor.track("t2", "Task B");
    monitor.start("t1");
    expect(monitor.list({ status: "running" })).toHaveLength(1);
    expect(monitor.list({ status: "pending" })).toHaveLength(1);
  });

  test("list filters by name", () => {
    monitor.track("t1", "Alpha");
    monitor.track("t2", "Beta");
    expect(monitor.list({ name: "Alpha" })).toHaveLength(1);
  });

  test("stats returns correct counts", () => {
    monitor.track("t1", "A");
    monitor.track("t2", "B");
    monitor.track("t3", "C");
    monitor.start("t1");
    monitor.complete("t1");
    monitor.start("t2");
    monitor.fail("t2", "err");
    const stats = monitor.stats();
    expect(stats.total).toBe(3);
    expect(stats.completed).toBe(1);
    expect(stats.failed).toBe(1);
    expect(stats.pending).toBe(1);
  });

  test("clear removes all tasks", () => {
    monitor.track("t1", "A");
    monitor.track("t2", "B");
    monitor.clear();
    expect(monitor.list()).toHaveLength(0);
    expect(monitor.stats().total).toBe(0);
  });

  test("operations on nonexistent task are no-ops", () => {
    monitor.start("nope");
    monitor.complete("nope");
    monitor.fail("nope", "err");
    monitor.retry("nope");
    monitor.log("nope", "info", "msg");
    expect(monitor.get("nope")).toBeUndefined();
  });
});

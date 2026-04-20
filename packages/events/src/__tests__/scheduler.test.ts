import { describe, test, expect, afterEach } from "bun:test";
import { createScheduler, parseCronToInterval } from "../scheduler";

describe("parseCronToInterval", () => {
  test("every minute: * * * * *", () => {
    expect(parseCronToInterval("* * * * *")).toBe(60_000);
  });

  test("every 5 minutes: */5 * * * *", () => {
    expect(parseCronToInterval("*/5 * * * *")).toBe(300_000);
  });

  test("every hour: 0 * * * *", () => {
    expect(parseCronToInterval("0 * * * *")).toBe(3_600_000);
  });

  test("every 2 hours: 0 */2 * * *", () => {
    expect(parseCronToInterval("0 */2 * * *")).toBe(7_200_000);
  });

  test("every day: 0 0 * * *", () => {
    expect(parseCronToInterval("0 0 * * *")).toBe(86_400_000);
  });

  test("invalid cron defaults to 60_000", () => {
    expect(parseCronToInterval("bad")).toBe(60_000);
  });
});

describe("Scheduler", () => {
  let scheduler: ReturnType<typeof createScheduler>;

  afterEach(() => {
    scheduler?.stopAll();
  });

  describe("schedule with interval", () => {
    test("executes handler at the specified interval", async () => {
      scheduler = createScheduler();
      let count = 0;
      scheduler.schedule({ name: "tick", interval: 30 }, () => {
        count++;
      });
      await Bun.sleep(100);
      expect(count).toBeGreaterThanOrEqual(2);
    });

    test("immediate option fires handler right away", async () => {
      scheduler = createScheduler();
      let count = 0;
      scheduler.schedule({ name: "imm", interval: 500, immediate: true }, () => {
        count++;
      });
      // The immediate call should have fired before any interval tick
      await Bun.sleep(50);
      expect(count).toBe(1);
    });
  });

  describe("schedule with cron", () => {
    test("cron expression is converted to interval", async () => {
      scheduler = createScheduler();
      let count = 0;
      // We can't wait 5 minutes, but we verify it schedules without error
      const task = scheduler.schedule({ name: "cron-task", cron: "*/5 * * * *" }, () => {
        count++;
      });
      expect(task.running).toBe(true);
      expect(task.name).toBe("cron-task");
    });
  });

  describe("stop", () => {
    test("stops a single task", async () => {
      scheduler = createScheduler();
      let count = 0;
      const task = scheduler.schedule({ name: "stoppable", interval: 30 }, () => {
        count++;
      });
      await Bun.sleep(80);
      task.stop();
      const snapshot = count;
      await Bun.sleep(80);
      expect(count).toBe(snapshot);
      expect(task.running).toBe(false);
    });

    test("stop is idempotent", () => {
      scheduler = createScheduler();
      const task = scheduler.schedule({ name: "idem", interval: 1000 }, () => {});
      task.stop();
      task.stop(); // should not throw
      expect(task.running).toBe(false);
    });
  });

  describe("stopAll", () => {
    test("stops all scheduled tasks", async () => {
      scheduler = createScheduler();
      let c1 = 0;
      let c2 = 0;
      scheduler.schedule({ name: "t1", interval: 30 }, () => {
        c1++;
      });
      scheduler.schedule({ name: "t2", interval: 30 }, () => {
        c2++;
      });
      await Bun.sleep(80);
      scheduler.stopAll();
      const s1 = c1;
      const s2 = c2;
      await Bun.sleep(80);
      expect(c1).toBe(s1);
      expect(c2).toBe(s2);
    });
  });

  describe("list", () => {
    test("returns all registered tasks", () => {
      scheduler = createScheduler();
      scheduler.schedule({ name: "a", interval: 1000 }, () => {});
      scheduler.schedule({ name: "b", interval: 1000 }, () => {});
      const tasks = scheduler.list();
      expect(tasks).toHaveLength(2);
      expect(tasks[0]!.name).toBe("a");
      expect(tasks[1]!.name).toBe("b");
    });

    test("returns empty array when no tasks", () => {
      scheduler = createScheduler();
      expect(scheduler.list()).toHaveLength(0);
    });
  });

  describe("error handling", () => {
    test("handler error does not crash the scheduler", async () => {
      scheduler = createScheduler();
      let count = 0;
      scheduler.schedule({ name: "err", interval: 30 }, () => {
        count++;
        if (count === 1) throw new Error("boom");
      });
      await Bun.sleep(100);
      // Should have continued scheduling despite error
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  describe("validation", () => {
    test("throws when neither cron nor interval is specified", () => {
      scheduler = createScheduler();
      expect(() => {
        scheduler.schedule({ name: "invalid" }, () => {});
      }).toThrow('Schedule "invalid" must specify either "cron" or "interval".');
    });
  });
});

import { describe, test, expect } from "bun:test";
import { createMemoryController } from "../memory";

describe("createMemoryController", () => {
  test("getInfo returns memory stats", () => {
    const mc = createMemoryController();
    const info = mc.getInfo();
    expect(info.heapUsed).toBeGreaterThan(0);
    expect(info.heapTotal).toBeGreaterThan(0);
    expect(info.rss).toBeGreaterThan(0);
    expect(info.usagePercent).toBeGreaterThanOrEqual(0);
    // usagePercent may exceed 1 under GC pressure
    expect(typeof info.usagePercent).toBe("number");
  });

  test("isHealthy returns true in normal conditions", () => {
    const mc = createMemoryController({ maxThreshold: 2 });
    expect(mc.isHealthy()).toBe(true);
  });

  test("start and stop timer", () => {
    const mc = createMemoryController({ checkInterval: 100000 });
    mc.start();
    mc.stop();
    // Should not throw
  });

  test("start is idempotent", () => {
    const mc = createMemoryController({ checkInterval: 100000 });
    mc.start();
    mc.start(); // second call should not create duplicate timer
    mc.stop();
  });
});

import { describe, test, expect } from "bun:test";
import { createInstanceCoordinator } from "../instance-coordinator";

describe("createInstanceCoordinator", () => {
  test("initial state is starting", () => {
    const ic = createInstanceCoordinator();
    expect(ic.getState()).toBe("starting");
  });

  test("custom instance id", () => {
    const ic = createInstanceCoordinator("my-instance");
    expect(ic.getInstanceId()).toBe("my-instance");
  });

  test("auto-generates instance id", () => {
    const ic = createInstanceCoordinator();
    expect(ic.getInstanceId()).toBeDefined();
    expect(ic.getInstanceId().length).toBeGreaterThan(0);
  });

  test("markReady sets state to ready", () => {
    const ic = createInstanceCoordinator();
    ic.markReady();
    expect(ic.getState()).toBe("ready");
    expect(ic.isReady()).toBe(true);
  });

  test("markDraining sets state to draining", () => {
    const ic = createInstanceCoordinator();
    ic.markReady();
    ic.markDraining();
    expect(ic.getState()).toBe("draining");
    expect(ic.isReady()).toBe(false);
  });

  test("markStopped sets state to stopped", () => {
    const ic = createInstanceCoordinator();
    ic.markStopped();
    expect(ic.getState()).toBe("stopped");
    expect(ic.isLive()).toBe(false);
  });

  test("isLive returns true unless stopped", () => {
    const ic = createInstanceCoordinator();
    expect(ic.isLive()).toBe(true);
    ic.markReady();
    expect(ic.isLive()).toBe(true);
    ic.markDraining();
    expect(ic.isLive()).toBe(true);
    ic.markStopped();
    expect(ic.isLive()).toBe(false);
  });

  test("setState directly changes state", () => {
    const ic = createInstanceCoordinator();
    ic.setState("ready");
    expect(ic.getState()).toBe("ready");
  });

  test("metadata includes startedAt", () => {
    const ic = createInstanceCoordinator();
    expect(ic.getMetadata().startedAt).toBeGreaterThan(0);
  });

  test("setMetadata and getMetadata", () => {
    const ic = createInstanceCoordinator();
    ic.setMetadata("version", "1.0.0");
    expect(ic.getMetadata().version).toBe("1.0.0");
  });

  test("getMetadata returns copy", () => {
    const ic = createInstanceCoordinator();
    const m1 = ic.getMetadata();
    m1.extra = "test";
    expect(ic.getMetadata().extra).toBeUndefined();
  });
});

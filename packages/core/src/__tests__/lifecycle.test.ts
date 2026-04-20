import { describe, test, expect, mock } from "bun:test";
import { createLifecycle } from "../lifecycle";

describe("createLifecycle", () => {
  test("runs beforeStart hooks in order", async () => {
    const lifecycle = createLifecycle();
    const calls: number[] = [];

    lifecycle.onBeforeStart(() => {
      calls.push(1);
    });
    lifecycle.onBeforeStart(() => {
      calls.push(2);
    });

    await lifecycle.runBeforeStart();
    expect(calls).toEqual([1, 2]);
  });

  test("runs afterStart hooks in order", async () => {
    const lifecycle = createLifecycle();
    const calls: number[] = [];

    lifecycle.onAfterStart(() => {
      calls.push(1);
    });
    lifecycle.onAfterStart(() => {
      calls.push(2);
    });

    await lifecycle.runAfterStart();
    expect(calls).toEqual([1, 2]);
  });

  test("runs beforeStop hooks in order", async () => {
    const lifecycle = createLifecycle();
    const calls: number[] = [];

    lifecycle.onBeforeStop(() => {
      calls.push(1);
    });
    lifecycle.onBeforeStop(() => {
      calls.push(2);
    });

    await lifecycle.runBeforeStop();
    expect(calls).toEqual([1, 2]);
  });

  test("handles async hooks", async () => {
    const lifecycle = createLifecycle();
    const calls: number[] = [];

    lifecycle.onBeforeStart(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      calls.push(1);
    });
    lifecycle.onBeforeStart(async () => {
      calls.push(2);
    });

    await lifecycle.runBeforeStart();
    // hook 1 finishes before hook 2 starts (sequential)
    expect(calls).toEqual([1, 2]);
  });

  test("error in hook propagates", async () => {
    const lifecycle = createLifecycle();

    lifecycle.onBeforeStart(() => {
      throw new Error("hook failed");
    });

    await expect(lifecycle.runBeforeStart()).rejects.toThrow("hook failed");
  });

  test("error in async hook propagates", async () => {
    const lifecycle = createLifecycle();

    lifecycle.onBeforeStart(async () => {
      throw new Error("async hook failed");
    });

    await expect(lifecycle.runBeforeStart()).rejects.toThrow(
      "async hook failed",
    );
  });

  test("no hooks registered runs without error", async () => {
    const lifecycle = createLifecycle();

    await lifecycle.runBeforeStart();
    await lifecycle.runAfterStart();
    await lifecycle.runBeforeStop();
  });

  test("hooks from different phases are independent", async () => {
    const lifecycle = createLifecycle();
    const calls: string[] = [];

    lifecycle.onBeforeStart(() => calls.push("beforeStart"));
    lifecycle.onAfterStart(() => calls.push("afterStart"));
    lifecycle.onBeforeStop(() => calls.push("beforeStop"));

    await lifecycle.runBeforeStart();
    expect(calls).toEqual(["beforeStart"]);

    await lifecycle.runAfterStart();
    expect(calls).toEqual(["beforeStart", "afterStart"]);

    await lifecycle.runBeforeStop();
    expect(calls).toEqual(["beforeStart", "afterStart", "beforeStop"]);
  });

  test("sync hooks work alongside async hooks", async () => {
    const lifecycle = createLifecycle();
    const calls: string[] = [];

    lifecycle.onBeforeStart(() => {
      calls.push("sync");
    });
    lifecycle.onBeforeStart(async () => {
      calls.push("async");
    });

    await lifecycle.runBeforeStart();
    expect(calls).toEqual(["sync", "async"]);
  });
});

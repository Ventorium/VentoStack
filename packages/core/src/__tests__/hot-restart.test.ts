import { describe, test, expect } from "bun:test";
import { createHotRestart } from "../hot-restart";

describe("createHotRestart", () => {
  test("initial state not restarting", () => {
    const hr = createHotRestart();
    expect(hr.isRestarting()).toBe(false);
    expect(hr.getRestartCount()).toBe(0);
  });

  test("restart increments count", async () => {
    const hr = createHotRestart({ gracefulTimeout: 10 });
    await hr.restart();
    expect(hr.getRestartCount()).toBe(1);
    expect(hr.isRestarting()).toBe(false);
  });

  test("callbacks are called", async () => {
    const calls: string[] = [];
    const hr = createHotRestart({
      gracefulTimeout: 10,
      onBeforeRestart: () => { calls.push("before"); },
      onAfterRestart: () => { calls.push("after"); },
    });
    await hr.restart();
    expect(calls).toEqual(["before", "after"]);
  });

  test("multiple restarts increment count", async () => {
    const hr = createHotRestart({ gracefulTimeout: 10 });
    await hr.restart();
    await hr.restart();
    expect(hr.getRestartCount()).toBe(2);
  });
});

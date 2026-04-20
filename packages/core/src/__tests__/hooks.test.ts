import { describe, test, expect } from "bun:test";
import { createHookRegistry } from "../hooks";

describe("createHookRegistry", () => {
  test("registers and emits hook", async () => {
    const hooks = createHookRegistry();
    const values: number[] = [];
    hooks.on<number>("test", (data) => { values.push(data); });
    await hooks.emit("test", 42);
    expect(values).toEqual([42]);
  });

  test("multiple listeners", async () => {
    const hooks = createHookRegistry();
    const values: number[] = [];
    hooks.on<number>("test", (data) => { values.push(data * 1); });
    hooks.on<number>("test", (data) => { values.push(data * 2); });
    await hooks.emit("test", 5);
    expect(values).toEqual([5, 10]);
  });

  test("unsubscribe removes listener", async () => {
    const hooks = createHookRegistry();
    const values: number[] = [];
    const unsub = hooks.on<number>("test", (data) => { values.push(data); });
    unsub();
    await hooks.emit("test", 42);
    expect(values).toEqual([]);
  });

  test("once fires only once", async () => {
    const hooks = createHookRegistry();
    const values: number[] = [];
    hooks.once<number>("test", (data) => { values.push(data); });
    await hooks.emit("test", 1);
    await hooks.emit("test", 2);
    expect(values).toEqual([1]);
  });

  test("off removes all listeners for hook", async () => {
    const hooks = createHookRegistry();
    const values: string[] = [];
    hooks.on("test", () => { values.push("a"); });
    hooks.on("test", () => { values.push("b"); });
    hooks.off("test");
    await hooks.emit("test", null);
    expect(values).toEqual([]);
  });

  test("hooks() lists registered hook names", () => {
    const hooks = createHookRegistry();
    hooks.on("a", () => {});
    hooks.on("b", () => {});
    expect(hooks.hooks().sort()).toEqual(["a", "b"]);
  });

  test("emit non-existent hook is no-op", async () => {
    const hooks = createHookRegistry();
    // Should not throw
    await hooks.emit("nonexistent", null);
  });

  test("async listener", async () => {
    const hooks = createHookRegistry();
    const values: string[] = [];
    hooks.on("test", async () => {
      await new Promise((r) => setTimeout(r, 1));
      values.push("async");
    });
    await hooks.emit("test", null);
    expect(values).toEqual(["async"]);
  });
});

import { describe, test, expect } from "bun:test";
import { createSaga, createTCC } from "../saga";

describe("createSaga", () => {
  test("executes all steps in order", async () => {
    const saga = createSaga<{ log: string[] }>();
    saga.addStep({
      name: "step1",
      execute: async (ctx) => ({ ...ctx, log: [...ctx.log, "exec1"] }),
      compensate: async (ctx) => ({ ...ctx, log: [...ctx.log, "comp1"] }),
    });
    saga.addStep({
      name: "step2",
      execute: async (ctx) => ({ ...ctx, log: [...ctx.log, "exec2"] }),
      compensate: async (ctx) => ({ ...ctx, log: [...ctx.log, "comp2"] }),
    });

    const result = await saga.execute({ log: [] });
    expect(result.status).toBe("completed");
    expect(result.completedSteps).toEqual(["step1", "step2"]);
    expect(result.context.log).toEqual(["exec1", "exec2"]);
  });

  test("compensates on failure (reverse order)", async () => {
    const saga = createSaga<{ log: string[] }>();
    saga.addStep({
      name: "step1",
      execute: async (ctx) => ({ ...ctx, log: [...ctx.log, "exec1"] }),
      compensate: async (ctx) => ({ ...ctx, log: [...ctx.log, "comp1"] }),
    });
    saga.addStep({
      name: "step2",
      execute: async (ctx) => ({ ...ctx, log: [...ctx.log, "exec2"] }),
      compensate: async (ctx) => ({ ...ctx, log: [...ctx.log, "comp2"] }),
    });
    saga.addStep({
      name: "step3",
      execute: async () => { throw new Error("boom"); },
      compensate: async (ctx) => ctx,
    });

    const result = await saga.execute({ log: [] });
    expect(result.status).toBe("failed");
    expect(result.failedStep).toBe("step3");
    expect(result.error).toBe("boom");
    expect(result.completedSteps).toEqual(["step1", "step2"]);
    // Compensations run in reverse: comp2, comp1
    expect(result.context.log).toContain("comp2");
    expect(result.context.log).toContain("comp1");
  });

  test("getSteps returns step names", () => {
    const saga = createSaga<void>();
    saga.addStep({ name: "a", execute: async (c) => c, compensate: async (c) => c });
    saga.addStep({ name: "b", execute: async (c) => c, compensate: async (c) => c });
    expect(saga.getSteps()).toEqual(["a", "b"]);
  });

  test("handles compensation failure gracefully", async () => {
    const saga = createSaga<{ value: number }>();
    saga.addStep({
      name: "step1",
      execute: async (ctx) => ({ value: ctx.value + 1 }),
      compensate: async () => { throw new Error("comp fail"); },
    });
    saga.addStep({
      name: "step2",
      execute: async () => { throw new Error("exec fail"); },
      compensate: async (ctx) => ctx,
    });

    const result = await saga.execute({ value: 0 });
    expect(result.status).toBe("failed");
    expect(result.failedStep).toBe("step2");
  });

  test("empty saga completes immediately", async () => {
    const saga = createSaga<string>();
    const result = await saga.execute("initial");
    expect(result.status).toBe("completed");
    expect(result.context).toBe("initial");
    expect(result.completedSteps).toEqual([]);
  });
});

describe("createTCC", () => {
  test("try then confirm all steps", async () => {
    const tcc = createTCC<{ log: string[] }>();
    tcc.addStep({
      name: "step1",
      try: async (ctx) => ({ log: [...ctx.log, "try1"] }),
      confirm: async (ctx) => ({ log: [...ctx.log, "confirm1"] }),
      cancel: async (ctx) => ({ log: [...ctx.log, "cancel1"] }),
    });
    tcc.addStep({
      name: "step2",
      try: async (ctx) => ({ log: [...ctx.log, "try2"] }),
      confirm: async (ctx) => ({ log: [...ctx.log, "confirm2"] }),
      cancel: async (ctx) => ({ log: [...ctx.log, "cancel2"] }),
    });

    const result = await tcc.execute({ log: [] });
    expect(result.status).toBe("completed");
    expect(result.context.log).toEqual(["try1", "try2", "confirm1", "confirm2"]);
  });

  test("cancel on try failure", async () => {
    const tcc = createTCC<{ log: string[] }>();
    tcc.addStep({
      name: "step1",
      try: async (ctx) => ({ log: [...ctx.log, "try1"] }),
      confirm: async (ctx) => ctx,
      cancel: async (ctx) => ({ log: [...ctx.log, "cancel1"] }),
    });
    tcc.addStep({
      name: "step2",
      try: async () => { throw new Error("try fail"); },
      confirm: async (ctx) => ctx,
      cancel: async (ctx) => ctx,
    });

    const result = await tcc.execute({ log: [] });
    expect(result.status).toBe("failed");
    expect(result.failedStep).toBe("step2");
    expect(result.context.log).toContain("cancel1");
  });

  test("handles confirm failure", async () => {
    const tcc = createTCC<{ value: number }>();
    tcc.addStep({
      name: "step1",
      try: async (ctx) => ({ value: ctx.value + 1 }),
      confirm: async () => { throw new Error("confirm fail"); },
      cancel: async (ctx) => ctx,
    });

    const result = await tcc.execute({ value: 0 });
    expect(result.status).toBe("failed");
    expect(result.failedStep).toBe("step1");
    expect(result.error).toBe("confirm fail");
  });
});

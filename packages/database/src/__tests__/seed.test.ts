import { describe, test, expect } from "bun:test";
import { createSeedRunner } from "../seed";

describe("createSeedRunner", () => {
  function createMockExecutor() {
    const executed: string[] = [];
    const executor = async (sql: string, params?: unknown[]) => {
      executed.push(sql);
      return [];
    };
    return { executor, executed };
  }

  test("adds and runs seeds", async () => {
    const { executor, executed } = createMockExecutor();
    const runner = createSeedRunner(executor);

    runner.addSeed({
      name: "001_users",
      run: async (exec) => {
        await exec("INSERT INTO users (name) VALUES ($1)", ["Alice"]);
      },
    });

    const result = await runner.run();
    expect(result).toEqual(["001_users"]);
    expect(executed).toContain("INSERT INTO users (name) VALUES ($1)");
  });

  test("runs seeds in name order", async () => {
    const { executor } = createMockExecutor();
    const runner = createSeedRunner(executor);
    const order: string[] = [];

    runner.addSeed({
      name: "002_posts",
      run: async () => { order.push("002"); },
    });
    runner.addSeed({
      name: "001_users",
      run: async () => { order.push("001"); },
    });

    await runner.run();
    expect(order).toEqual(["001", "002"]);
  });

  test("runs only specified seeds", async () => {
    const { executor } = createMockExecutor();
    const runner = createSeedRunner(executor);
    const ran: string[] = [];

    runner.addSeed({ name: "a", run: async () => { ran.push("a"); } });
    runner.addSeed({ name: "b", run: async () => { ran.push("b"); } });
    runner.addSeed({ name: "c", run: async () => { ran.push("c"); } });

    const result = await runner.run({ only: ["b"] });
    expect(result).toEqual(["b"]);
    expect(ran).toEqual(["b"]);
  });

  test("lists seeds", () => {
    const { executor } = createMockExecutor();
    const runner = createSeedRunner(executor);
    runner.addSeed({ name: "a", run: async () => {} });
    runner.addSeed({ name: "b", run: async () => {} });
    expect(runner.list()).toEqual(["a", "b"]);
  });

  test("returns empty when no seeds", async () => {
    const { executor } = createMockExecutor();
    const runner = createSeedRunner(executor);
    const result = await runner.run();
    expect(result).toEqual([]);
  });
});

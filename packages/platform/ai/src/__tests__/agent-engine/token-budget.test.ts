import { describe, test, expect } from "bun:test";
import { createTokenBudgetChecker } from "../../agent-engine/token-budget";
import { createMockCache } from "../helpers";

describe("createTokenBudgetChecker", () => {
  test("allows consumption within budget", async () => {
    const cache = createMockCache();
    const checker = createTokenBudgetChecker({
      cache: cache as never,
      config: { perUserDaily: 1000 },
    });

    const result = await checker.check("user1", "tenant1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1000);

    await checker.consume("user1", "tenant1", 500);
    const after = await checker.check("user1", "tenant1");
    expect(after.allowed).toBe(true);
    expect(after.remaining).toBe(500);
  });

  test("blocks when budget exceeded", async () => {
    const cache = createMockCache();
    const checker = createTokenBudgetChecker({
      cache: cache as never,
      config: { perUserDaily: 100 },
    });

    await checker.consume("user1", "tenant1", 100);
    const result = await checker.check("user1", "tenant1");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  test("throws on over-consumption", async () => {
    const cache = createMockCache();
    const checker = createTokenBudgetChecker({
      cache: cache as never,
      config: { perUserDaily: 100 },
    });

    await expect(
      checker.consume("user1", "tenant1", 200),
    ).rejects.toThrow();
  });

  test("tracks usage correctly", async () => {
    const cache = createMockCache();
    const checker = createTokenBudgetChecker({
      cache: cache as never,
    });

    await checker.consume("user1", "tenant1", 50);
    await checker.consume("user1", "tenant1", 30);
    const usage = await checker.getUsage("user1", "tenant1");
    expect(usage).toBe(80);
  });
});

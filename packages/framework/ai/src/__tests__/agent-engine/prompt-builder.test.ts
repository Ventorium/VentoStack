import { describe, test, expect } from "bun:test";
import { fitMessagesToBudget } from "../../agent-engine/prompt-builder";

describe("fitMessagesToBudget", () => {
  test("returns messages when under budget", () => {
    const messages = [
      { role: "user" as const, content: "Hello" },
      { role: "assistant" as const, content: "Hi there!" },
    ];
    const result = fitMessagesToBudget(messages, "System prompt", {
      maxPromptTokens: 100000,
      maxCompletionTokens: 4096,
      reservedForContext: 4000,
    });
    expect(result.length).toBe(2);
  });

  test("trims old messages when over budget", () => {
    const messages = Array.from({ length: 100 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `Message ${i}: ${"x".repeat(500)}`,
    }));

    const result = fitMessagesToBudget(messages, "System prompt", {
      maxPromptTokens: 5000,
      maxCompletionTokens: 1000,
      reservedForContext: 500,
    });
    // Should trim to fit
    expect(result.length).toBeLessThan(messages.length);
  });

  test("preserves system messages", () => {
    const messages = [
      { role: "system" as const, content: "You are helpful." },
      { role: "user" as const, content: "Hello" },
      { role: "assistant" as const, content: "Hi!" },
    ];
    const result = fitMessagesToBudget(messages, "System", {
      maxPromptTokens: 100000,
      maxCompletionTokens: 4096,
      reservedForContext: 4000,
    });
    expect(result.length).toBe(3);
  });
});

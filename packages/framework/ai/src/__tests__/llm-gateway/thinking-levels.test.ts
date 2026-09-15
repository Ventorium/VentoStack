import { describe, expect, test } from "bun:test";
import { allowedThinkingLevels } from "../../llm-gateway/thinking-levels";

describe("allowedThinkingLevels", () => {
  test("returns only off when the model does not support thinking", () => {
    expect(allowedThinkingLevels(false, null)).toEqual(["off"]);
    expect(allowedThinkingLevels(false, [{ type: "effort", values: ["high"] }])).toEqual(["off"]);
  });

  test("falls back to the OpenAI-safe set when effort values are not declared", () => {
    // 未声明时不能给出 xhigh —— OpenAI reasoning_effort 枚举里没有该档位
    expect(allowedThinkingLevels(true, null)).toEqual(["off", "minimal", "low", "medium", "high"]);
    expect(allowedThinkingLevels(true, [])).toEqual(["off", "minimal", "low", "medium", "high"]);
    expect(allowedThinkingLevels(true, [{ type: "effort", values: [] }])).toEqual([
      "off",
      "minimal",
      "low",
      "medium",
      "high",
    ]);
  });

  test("trusts the declared effort values (model config is authoritative)", () => {
    expect(allowedThinkingLevels(true, [{ type: "effort", values: ["low", "medium", "xhigh"] }])).toEqual([
      "off",
      "low",
      "medium",
      "xhigh",
    ]);
  });

  test("ignores unknown values and duplicate off in declared list", () => {
    expect(
      allowedThinkingLevels(true, [{ type: "effort", values: ["off", "low", "bogus", "high"] }]),
    ).toEqual(["off", "low", "high"]);
  });

  test("ignores non-effort reasoning options", () => {
    expect(allowedThinkingLevels(true, [{ type: "budget_tokens" }])).toEqual([
      "off",
      "minimal",
      "low",
      "medium",
      "high",
    ]);
  });
});

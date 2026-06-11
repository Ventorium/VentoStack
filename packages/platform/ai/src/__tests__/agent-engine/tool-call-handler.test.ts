import { describe, test, expect } from "bun:test";
import { attemptJSONRepair } from "../../agent-engine/tool-call-handler";

describe("attemptJSONRepair", () => {
  test("parses valid JSON", () => {
    const result = attemptJSONRepair('{"key": "value"}');
    expect(result).toEqual({ key: "value" });
  });

  test("repairs trailing commas", () => {
    const result = attemptJSONRepair('{"key": "value",}');
    expect(result).toEqual({ key: "value" });
  });

  test("repairs single quotes", () => {
    const result = attemptJSONRepair("{'key': 'value'}");
    expect(result).toEqual({ key: "value" });
  });

  test("strips markdown code blocks", () => {
    const result = attemptJSONRepair('```json\n{"key": "value"}\n```');
    expect(result).toEqual({ key: "value" });
  });
});

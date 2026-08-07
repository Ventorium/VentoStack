import { afterEach, describe, expect, test } from "bun:test";
import { createOpenAIProvider } from "../../llm-gateway/providers/openai";
import type { StreamChunk } from "../../llm-gateway/types";

describe("OpenAI Chat streaming Adapter", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("assembles interleaved parallel tool-call deltas by index", async () => {
    const frames = [
      { choices: [{ delta: { tool_calls: [
        { index: 0, id: "call-a", function: { name: "first", arguments: '{"value":' } },
        { index: 1, id: "call-b", function: { name: "second", arguments: '{"value":' } },
      ] } }] },
      { choices: [{ delta: { tool_calls: [
        { index: 1, function: { arguments: '2}' } },
        { index: 0, function: { arguments: '1}' } },
      ] }, finish_reason: "tool_calls" }] },
    ].map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("") + "data: [DONE]\n\n";
    globalThis.fetch = (async () => new Response(frames)) as typeof fetch;
    const chunks: StreamChunk[] = [];

    for await (const chunk of createOpenAIProvider({ apiKey: "secret" }).chatStream({
      model: "gpt",
      messages: [{ role: "user", content: "run" }],
    })) chunks.push(chunk);

    expect(chunks.filter((chunk) => chunk.type === "tool_call_start")).toEqual([
      { type: "tool_call_start", toolCall: { id: "call-a", name: "first", arguments: { value: 1 } } },
      { type: "tool_call_start", toolCall: { id: "call-b", name: "second", arguments: { value: 2 } } },
    ]);
  });
});

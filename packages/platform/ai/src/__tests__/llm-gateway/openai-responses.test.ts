import { afterEach, describe, expect, test } from "bun:test";
import { createOpenAIResponsesProvider } from "../../llm-gateway/providers/openai-responses";
import type { StreamChunk } from "../../llm-gateway/types";

describe("OpenAI Responses Adapter", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("maps transcript, reasoning and function calls in both directions", async () => {
    let request: Record<string, unknown> = {};
    globalThis.fetch = (async (_input, init) => {
      request = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        status: "completed",
        output: [
          { type: "message", content: [{ type: "output_text", text: "checking" }] },
          { type: "function_call", call_id: "call-2", name: "lookup", arguments: '{"query":"next"}' },
        ],
        usage: { input_tokens: 12, output_tokens: 5 },
      });
    }) as typeof fetch;
    const provider = createOpenAIResponsesProvider({ apiKey: "secret" });

    const result = await provider.chat({
      model: "gpt-5",
      thinkingLevel: "high",
      messages: [
        { role: "user", content: "start" },
        { role: "assistant", content: "", tool_calls: [{ id: "call-1", name: "lookup", arguments: { query: "first" } }] },
        { role: "tool", content: "found", tool_call_id: "call-1" },
      ],
      tools: [{ name: "lookup", description: "Lookup", parameters: { type: "object", properties: {} } }],
    });

    expect(request.reasoning).toEqual({ effort: "high" });
    expect(request.input).toContainEqual({ type: "function_call_output", call_id: "call-1", output: "found" });
    expect(result.toolCalls).toEqual([{ id: "call-2", name: "lookup", arguments: { query: "next" } }]);
    expect(result.finishReason).toBe("tool_calls");
  });

  test("streams text, completed tool calls and usage", async () => {
    const events = [
      { type: "response.output_text.delta", delta: "hello" },
      { type: "response.output_item.done", item: { type: "function_call", call_id: "call-1", name: "lookup", arguments: '{"query":"x"}' } },
      { type: "response.completed", response: { usage: { input_tokens: 3, output_tokens: 2 } } },
    ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
    globalThis.fetch = (async () => new Response(events, { headers: { "content-type": "text/event-stream" } })) as typeof fetch;
    const chunks: StreamChunk[] = [];

    for await (const chunk of createOpenAIResponsesProvider({ apiKey: "secret" }).chatStream({
      model: "gpt-5",
      messages: [{ role: "user", content: "start" }],
    })) chunks.push(chunk);

    expect(chunks).toContainEqual({ type: "content", delta: "hello" });
    expect(chunks).toContainEqual({ type: "tool_call_start", toolCall: { id: "call-1", name: "lookup", arguments: { query: "x" } } });
    expect(chunks).toContainEqual({ type: "usage", usage: { promptTokens: 3, completionTokens: 2 } });
    expect(chunks.at(-1)).toEqual({ type: "done" });
  });
});

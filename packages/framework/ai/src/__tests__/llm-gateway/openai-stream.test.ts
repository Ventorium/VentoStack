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

  test("keeps tool name and arguments when a compatible endpoint omits tool call id", async () => {
    const frames = [
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "kb-search", arguments: '{"query":' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"业态评估"}' } }] }, finish_reason: "tool_calls" }] },
    ].map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("") + "data: [DONE]\n\n";
    globalThis.fetch = (async () => new Response(frames)) as typeof fetch;
    const chunks: StreamChunk[] = [];

    for await (const chunk of createOpenAIProvider({ apiKey: "secret" }).chatStream({
      model: "gpt",
      messages: [{ role: "user", content: "search" }],
    })) chunks.push(chunk);

    const toolCall = chunks.find((chunk) => chunk.type === "tool_call_start");
    expect(toolCall?.type).toBe("tool_call_start");
    if (toolCall?.type === "tool_call_start") {
      expect(toolCall.toolCall?.id).toStartWith("tool-call-");
      expect(toolCall.toolCall?.name).toBe("kb-search");
      expect(toolCall.toolCall?.arguments).toEqual({ query: "业态评估" });
    }
  });

  test("emits reasoning chunks for delta.reasoning_content (Qwen/DeepSeek)", async () => {
    const frames = [
      { choices: [{ delta: { reasoning_content: "Let me think." } }] },
      { choices: [{ delta: { reasoning_content: " Step by step." } }] },
      { choices: [{ delta: { content: "The answer is 42." }, finish_reason: "stop" }] },
    ].map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("") + "data: [DONE]\n\n";
    globalThis.fetch = (async () => new Response(frames)) as typeof fetch;
    const chunks: StreamChunk[] = [];

    for await (const chunk of createOpenAIProvider({ apiKey: "secret" }).chatStream({
      model: "qwen3",
      messages: [{ role: "user", content: "1+1?" }],
      thinkingLevel: "low",
    })) chunks.push(chunk);

    const reasoning = chunks.filter((chunk) => chunk.type === "reasoning");
    expect(reasoning.map((chunk) => chunk.delta).join("")).toBe("Let me think. Step by step.");
    const content = chunks.filter((chunk) => chunk.type === "content");
    expect(content.map((chunk) => chunk.delta).join("")).toBe("The answer is 42.");
  });

  test("emits reasoning chunks for delta.reasoning (vLLM 0.27+ renamed field)", async () => {
    const frames = [
      { choices: [{ delta: { reasoning: "Step one." } }] },
      { choices: [{ delta: { reasoning: " Step two." } }] },
      { choices: [{ delta: { content: "Done." }, finish_reason: "stop" }] },
    ].map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("") + "data: [DONE]\n\n";
    globalThis.fetch = (async () => new Response(frames)) as typeof fetch;
    const chunks: StreamChunk[] = [];

    for await (const chunk of createOpenAIProvider({ apiKey: "secret" }).chatStream({
      model: "qwen3",
      messages: [{ role: "user", content: "1+1?" }],
      thinkingLevel: "low",
    })) chunks.push(chunk);

    const reasoning = chunks.filter((chunk) => chunk.type === "reasoning");
    expect(reasoning.map((chunk) => chunk.delta).join("")).toBe("Step one. Step two.");
    const content = chunks.filter((chunk) => chunk.type === "content");
    expect(content.map((chunk) => chunk.delta).join("")).toBe("Done.");
  });

  test("serializes internal assistant tool calls to OpenAI message format", async () => {
    let requestBody: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response("data: [DONE]\n\n");
    }) as typeof fetch;

    for await (const _chunk of createOpenAIProvider({ apiKey: "secret" }).chatStream({
      model: "gpt",
      messages: [
        { role: "assistant", content: "", tool_calls: [{ id: "call-1", name: "kb-search", arguments: { query: "业态评估" } }] },
        { role: "tool", content: "result", tool_call_id: "call-1" },
      ],
    })) { /* consume */ }

    expect(requestBody?.messages).toEqual([
      { role: "assistant", content: "", tool_calls: [{ id: "call-1", type: "function", function: { name: "kb-search", arguments: '{"query":"业态评估"}' } }] },
      { role: "tool", content: "result", tool_call_id: "call-1" },
    ]);
  });
});

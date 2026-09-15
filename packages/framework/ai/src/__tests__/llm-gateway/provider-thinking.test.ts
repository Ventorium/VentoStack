import { afterEach, describe, expect, test } from "bun:test";
import { createOpenAIProvider } from "../../llm-gateway/providers/openai";
import { createAnthropicProvider } from "../../llm-gateway/providers/anthropic";
import { createGoogleProvider } from "../../llm-gateway/providers/google";

describe("provider-neutral thinking levels", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("maps thinking level to OpenAI reasoning_effort", async () => {
    let body: Record<string, unknown> = {};
    globalThis.fetch = (async (_input, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });
    }) as typeof fetch;

    await createOpenAIProvider({ apiKey: "secret" }).chat({
      model: "o3",
      messages: [{ role: "user", content: "think" }],
      thinkingLevel: "high",
    });

    expect(body.reasoning_effort).toBe("high");
    // Qwen/vLLM 系兼容部署：显式声明 enable_thinking 才会分离 reasoning_content
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: true });
  });

  test("sends enable_thinking false for OpenAI provider when thinking is off", async () => {
    let body: Record<string, unknown> = {};
    globalThis.fetch = (async (_input, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });
    }) as typeof fetch;

    await createOpenAIProvider({ apiKey: "secret" }).chat({
      model: "qwen3",
      messages: [{ role: "user", content: "think" }],
      thinkingLevel: "off",
    });

    expect(body.reasoning_effort).toBeUndefined();
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  test("omits chat_template_kwargs when thinking level is not provided", async () => {
    let body: Record<string, unknown> = {};
    globalThis.fetch = (async (_input, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });
    }) as typeof fetch;

    await createOpenAIProvider({ apiKey: "secret" }).chat({
      model: "gpt",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(body.chat_template_kwargs).toBeUndefined();
  });

  test("maps thinking level to Anthropic budget and omits incompatible temperature", async () => {
    let body: Record<string, unknown> = {};
    globalThis.fetch = (async (_input, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({ content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } });
    }) as typeof fetch;

    await createAnthropicProvider({ apiKey: "secret" }).chat({
      model: "claude",
      messages: [{ role: "user", content: "think" }],
      thinkingLevel: "medium",
      temperature: 0.5,
    });

    expect(body.thinking).toEqual({ type: "enabled", budget_tokens: 4096 });
    expect(body.temperature).toBeUndefined();
  });

  test("maps thinking level and max tokens to Google generationConfig", async () => {
    let body: Record<string, unknown> = {};
    globalThis.fetch = (async (_input, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
      });
    }) as typeof fetch;

    await createGoogleProvider({ apiKey: "secret" }).chat({
      model: "gemini",
      messages: [{ role: "user", content: "think" }],
      thinkingLevel: "low",
      maxTokens: 2048,
    });

    expect(body.generationConfig).toEqual({
      maxOutputTokens: 2048,
      thinkingConfig: { thinkingBudget: 1024 },
    });
  });
});

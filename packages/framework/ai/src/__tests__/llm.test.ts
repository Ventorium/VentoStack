import { describe, expect, mock, test } from "bun:test";
import { createLLMClient } from "../llm";

describe("createLLMClient", () => {
  test("requires non-empty apiKey", () => {
    expect(() => createLLMClient({ apiKey: "", model: "gpt-4" })).toThrow(
      "LLM client requires a non-empty apiKey",
    );
    expect(() => createLLMClient({ apiKey: "   ", model: "gpt-4" })).toThrow(
      "LLM client requires a non-empty apiKey",
    );
  });

  test("constructs request correctly", async () => {
    const mockFetch = mock(async (url: string, init?: RequestInit) => {
      expect(url).toContain("/chat/completions");
      const body = JSON.parse((init?.body as string) ?? "{}");
      expect(body.model).toBe("gpt-4");
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0]).toEqual({ role: "user", content: "Hello" });
      expect(body.temperature).toBe(0.7);

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "Hi there" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = mockFetch;

    const client = createLLMClient({ apiKey: "sk-test", model: "gpt-4" });
    const response = await client.chat([{ role: "user", content: "Hello" }]);
    expect(response).toBe("Hi there");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Restore
    globalThis.fetch = fetch;
  });

  test("passes custom baseURL, temperature, maxTokens", async () => {
    const mockFetch = mock(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse((init?.body as string) ?? "{}");
      expect(body.max_tokens).toBe(100);
      expect(body.temperature).toBe(0.2);

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "OK" } }],
        }),
        { status: 200 },
      );
    });

    globalThis.fetch = mockFetch;

    const client = createLLMClient({
      apiKey: "sk-test",
      model: "claude",
      baseURL: "https://api.anthropic.com/v1",
      temperature: 0.2,
      maxTokens: 100,
    });

    await client.chat([{ role: "user", content: "Test" }]);

    globalThis.fetch = fetch;
  });

  test("throws on API error", async () => {
    const mockFetch = mock(async () => {
      return new Response(JSON.stringify({ error: "invalid key" }), {
        status: 401,
      });
    });

    globalThis.fetch = mockFetch;

    const client = createLLMClient({ apiKey: "sk-bad", model: "gpt-4" });
    await expect(client.chat([{ role: "user", content: "Hi" }])).rejects.toThrow("401");

    globalThis.fetch = fetch;
  });

  test("throws on timeout", async () => {
    const mockFetch = mock(async (_url, init) => {
      const signal = (init as RequestInit)?.signal;
      if (signal) {
        await new Promise<void>((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("Aborted")));
        });
      }
      return new Response("{}");
    });

    globalThis.fetch = mockFetch;

    const client = createLLMClient({
      apiKey: "sk-test",
      model: "gpt-4",
      timeout: 10,
    });

    await expect(client.chat([{ role: "user", content: "Hi" }])).rejects.toThrow("timed out");

    globalThis.fetch = fetch;
  });

  test("throws when response has no content", async () => {
    const mockFetch = mock(async () => {
      return new Response(JSON.stringify({ choices: [{}] }), { status: 200 });
    });

    globalThis.fetch = mockFetch;

    const client = createLLMClient({ apiKey: "sk-test", model: "gpt-4" });
    await expect(client.chat([{ role: "user", content: "Hi" }])).rejects.toThrow("empty content");

    globalThis.fetch = fetch;
  });
});

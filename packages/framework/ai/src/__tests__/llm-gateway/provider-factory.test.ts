import { describe, expect, test } from "bun:test";
import { createConfiguredProvider, type LLMProviderFactory } from "../../module";

describe("provider protocol adapters", () => {
  test("routes provider names independently from their wire protocol", () => {
    const deepseek = createConfiguredProvider({
      name: "deepseek",
      apiFormat: "openai_chat",
      apiKey: "secret",
      baseUrl: "https://api.deepseek.example/v1",
    });
    const vertexProxy = createConfiguredProvider({
      name: "vertex-proxy",
      apiFormat: "google",
      apiKey: "secret",
      headers: { "x-tenant": "tenant" },
    });

    expect(deepseek.name).toBe("deepseek");
    expect(vertexProxy.name).toBe("vertex-proxy");
  });

  test("supports custom protocol adapters without changing the module", () => {
    let receivedName = "";
    const factory: LLMProviderFactory = (config) => {
      receivedName = config.name;
      return {
        name: config.name,
        capabilities: { functionCalling: false, maxContextLength: 4096, supportsVision: false, supportsStreaming: true },
        async chat() { return { content: "", usage: { promptTokens: 0, completionTokens: 0 }, finishReason: "stop" }; },
        async *chatStream() { yield { type: "done" as const }; },
        async listModels() { return []; },
      };
    };

    const provider = createConfiguredProvider(
      { name: "private-cloud", apiFormat: "company-protocol", apiKey: "secret" },
      { "company-protocol": factory },
    );

    expect(receivedName).toBe("private-cloud");
    expect(provider.name).toBe("private-cloud");
  });

  test("rejects unknown protocols instead of silently sending the wrong payload", () => {
    expect(() => createConfiguredProvider({ name: "bad", apiFormat: "unknown", apiKey: "secret" })).toThrow("Unsupported provider API format");
  });
});

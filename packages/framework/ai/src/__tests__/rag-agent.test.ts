import { describe, expect, mock, test } from "bun:test";
import { createContextManager } from "../context";
import type { LLMClient } from "../llm";
import { createKnowledgeBase } from "../rag";
import { createRAGAgent } from "../rag-agent";

describe("createRAGAgent", () => {
  test("throws on invalid topK", () => {
    const kb = createKnowledgeBase();
    const ctx = createContextManager();
    const llm: LLMClient = { chat: mock(async () => "answer") };

    expect(() =>
      createRAGAgent(
        { knowledgeBase: kb, contextManager: ctx, llmClient: llm },
        { name: "test", systemPrompt: "You are helpful.", topK: 0 },
      ),
    ).toThrow("topK must be between 1 and 20");

    expect(() =>
      createRAGAgent(
        { knowledgeBase: kb, contextManager: ctx, llmClient: llm },
        { name: "test", systemPrompt: "You are helpful.", topK: 21 },
      ),
    ).toThrow("topK must be between 1 and 20");
  });

  test("basic chat flow with retrieval", async () => {
    const kb = createKnowledgeBase();
    kb.add({
      content: "To define HTTP routes in VentoStack, call createRouter and register paths.",
      metadata: { title: "Router Guide", source: "router.md" },
    });
    kb.add({
      content: "To create the application instance, call createApp and pass configuration.",
      metadata: { title: "App Guide", source: "app.md" },
    });

    const ctx = createContextManager();
    const llm: LLMClient = {
      chat: mock(async (messages) => {
        // Verify messages contain retrieved context
        const lastMsg = messages[messages.length - 1];
        expect(lastMsg?.role).toBe("user");
        expect(lastMsg?.content).toContain("define");
        return "You can use createRouter to define routes.";
      }),
    };

    const agent = createRAGAgent(
      { knowledgeBase: kb, contextManager: ctx, llmClient: llm },
      { name: "docs", systemPrompt: "You are a doc assistant.", topK: 3 },
    );

    const result = await agent.chat("How do I define routes?");

    expect(result.answer).toBe("You can use createRouter to define routes.");
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources[0]!.title).toBe("Router Guide");
    expect(result.conversationId).toBeDefined();
  });

  test("continues conversation with conversationId", async () => {
    const kb = createKnowledgeBase();
    kb.add({
      content: "VentoStack middleware is a function that takes ctx and next.",
      metadata: { title: "Middleware" },
    });

    const ctx = createContextManager();
    const llm: LLMClient = {
      chat: mock(async () => "Middleware is a function."),
    };

    const agent = createRAGAgent(
      { knowledgeBase: kb, contextManager: ctx, llmClient: llm },
      { name: "docs", systemPrompt: "You are a doc assistant." },
    );

    const first = await agent.chat("What is middleware?");
    const second = await agent.chat("Can you give an example?", first.conversationId);

    expect(second.conversationId).toBe(first.conversationId);
    // History should include both exchanges
    const history = ctx.getHistory(first.conversationId);
    expect(history.filter((m) => m.role === "user").length).toBe(2);
    expect(history.filter((m) => m.role === "assistant").length).toBe(2);
  });

  test("truncates long input", async () => {
    const kb = createKnowledgeBase();
    const ctx = createContextManager();
    const llm: LLMClient = {
      chat: mock(async (messages) => {
        const lastMsg = messages[messages.length - 1];
        expect(lastMsg!.content).toEndWith("...");
        return "OK";
      }),
    };

    const agent = createRAGAgent(
      { knowledgeBase: kb, contextManager: ctx, llmClient: llm },
      { name: "docs", systemPrompt: "You are a doc assistant.", maxInputLength: 10 },
    );

    const result = await agent.chat("This is a very long message that should be truncated.");
    expect(result.answer).toBe("OK");
  });

  test("returns fallback on LLM error", async () => {
    const kb = createKnowledgeBase();
    kb.add({
      content: "Some content here.",
      metadata: { title: "Doc" },
    });

    const ctx = createContextManager();
    const llm: LLMClient = {
      chat: mock(async () => {
        throw new Error("Network error");
      }),
    };

    const agent = createRAGAgent(
      { knowledgeBase: kb, contextManager: ctx, llmClient: llm },
      { name: "docs", systemPrompt: "You are a doc assistant." },
    );

    const result = await agent.chat("Some content");

    expect(result.answer).toContain("检索到相关文档");
    expect(result.answer).toContain("Network error");
    expect(result.sources.length).toBe(1);
  });

  test("returns fallback with no sources on LLM error", async () => {
    const kb = createKnowledgeBase();
    const ctx = createContextManager();
    const llm: LLMClient = {
      chat: mock(async () => {
        throw new Error("Network error");
      }),
    };

    const agent = createRAGAgent(
      { knowledgeBase: kb, contextManager: ctx, llmClient: llm },
      { name: "docs", systemPrompt: "You are a doc assistant." },
    );

    const result = await agent.chat("Unrelated question?");

    expect(result.answer).toContain("未找到相关文档");
    expect(result.sources).toHaveLength(0);
  });

  test("exposes name and systemPrompt as getters", () => {
    const kb = createKnowledgeBase();
    const ctx = createContextManager();
    const llm: LLMClient = { chat: mock(async () => "") };

    const agent = createRAGAgent(
      { knowledgeBase: kb, contextManager: ctx, llmClient: llm },
      { name: "my-agent", systemPrompt: "Be helpful." },
    );

    expect(agent.name).toBe("my-agent");
    expect(agent.systemPrompt).toBe("Be helpful.");
  });
});

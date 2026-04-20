import { describe, test, expect } from "bun:test";
import { createKnowledgeBase, createAgentRegistry } from "../rag";

describe("createKnowledgeBase", () => {
  test("adds and retrieves documents", () => {
    const kb = createKnowledgeBase();
    const id = kb.add({ content: "Hello world" });
    expect(id).toBeDefined();
    expect(kb.size()).toBe(1);
    expect(kb.list()).toHaveLength(1);
    expect(kb.list()[0]!.content).toBe("Hello world");
  });

  test("removes document", () => {
    const kb = createKnowledgeBase();
    const id = kb.add({ content: "test" });
    expect(kb.remove(id)).toBe(true);
    expect(kb.size()).toBe(0);
  });

  test("remove non-existent returns false", () => {
    const kb = createKnowledgeBase();
    expect(kb.remove("nonexistent")).toBe(false);
  });

  test("search finds matching documents", () => {
    const kb = createKnowledgeBase();
    kb.add({ content: "TypeScript is a programming language" });
    kb.add({ content: "JavaScript runs in the browser" });
    kb.add({ content: "Cooking recipes for pasta" });

    const results = kb.search("programming language TypeScript");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.document.content).toContain("TypeScript");
  });

  test("search returns empty for no match", () => {
    const kb = createKnowledgeBase();
    kb.add({ content: "Hello world" });
    const results = kb.search("quantum physics");
    expect(results).toHaveLength(0);
  });

  test("search respects limit", () => {
    const kb = createKnowledgeBase();
    for (let i = 0; i < 20; i++) {
      kb.add({ content: `Document about programming concept ${i}` });
    }
    const results = kb.search("programming", 5);
    expect(results.length).toBeLessThanOrEqual(5);
  });

  test("search results sorted by score", () => {
    const kb = createKnowledgeBase();
    kb.add({ content: "cat" });
    kb.add({ content: "cat cat cat dog" });
    kb.add({ content: "dog" });

    const results = kb.search("cat");
    expect(results.length).toBeGreaterThan(0);
    // First result should have higher score
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
    }
  });

  test("chunk splits text", () => {
    const kb = createKnowledgeBase();
    const text = "Paragraph one.\n\nParagraph two.\n\nParagraph three.";
    const chunks = kb.chunk(text, { maxChunkSize: 30, overlap: 0 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  test("chunk handles short text", () => {
    const kb = createKnowledgeBase();
    const chunks = kb.chunk("Short text.", { maxChunkSize: 1000 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe("Short text.");
  });

  test("chunk with overlap", () => {
    const kb = createKnowledgeBase();
    const text = "First paragraph is here.\n\nSecond paragraph follows.\n\nThird paragraph ends.";
    const chunks = kb.chunk(text, { maxChunkSize: 40, overlap: 10 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  test("document metadata preserved", () => {
    const kb = createKnowledgeBase();
    kb.add({ content: "test", metadata: { source: "file.txt", page: 1 } });
    const doc = kb.list()[0]!;
    expect(doc.metadata).toEqual({ source: "file.txt", page: 1 });
  });
});

describe("createAgentRegistry", () => {
  test("registers and retrieves agent", () => {
    const registry = createAgentRegistry();
    registry.register({
      name: "assistant",
      systemPrompt: "You are a helpful assistant.",
    });
    const agent = registry.get("assistant");
    expect(agent).toBeDefined();
    expect(agent!.systemPrompt).toBe("You are a helpful assistant.");
  });

  test("returns undefined for unknown agent", () => {
    const registry = createAgentRegistry();
    expect(registry.get("unknown")).toBeUndefined();
  });

  test("lists agents", () => {
    const registry = createAgentRegistry();
    registry.register({ name: "a", systemPrompt: "A" });
    registry.register({ name: "b", systemPrompt: "B" });
    expect(registry.list()).toHaveLength(2);
  });

  test("removes agent", () => {
    const registry = createAgentRegistry();
    registry.register({ name: "x", systemPrompt: "X" });
    expect(registry.remove("x")).toBe(true);
    expect(registry.get("x")).toBeUndefined();
  });

  test("remove non-existent returns false", () => {
    const registry = createAgentRegistry();
    expect(registry.remove("nonexistent")).toBe(false);
  });

  test("agent with input schema", () => {
    const registry = createAgentRegistry();
    registry.register({
      name: "query",
      systemPrompt: "Answer questions.",
      inputSchema: {
        question: { type: "string", description: "The question", required: true },
      },
    });
    const agent = registry.get("query")!;
    expect(agent.inputSchema).toBeDefined();
    expect(agent.inputSchema!.question.type).toBe("string");
  });

  test("agent with memory config", () => {
    const registry = createAgentRegistry();
    registry.register({
      name: "chat",
      systemPrompt: "Chat with memory.",
      memory: { shortTerm: true, longTerm: true, maxItems: 100 },
    });
    const agent = registry.get("chat")!;
    expect(agent.memory!.shortTerm).toBe(true);
    expect(agent.memory!.maxItems).toBe(100);
  });

  test("agent with knowledge base", () => {
    const kb = createKnowledgeBase();
    kb.add({ content: "Some knowledge" });

    const registry = createAgentRegistry();
    registry.register({
      name: "rag-agent",
      systemPrompt: "Use knowledge base.",
      knowledgeBase: kb,
    });
    const agent = registry.get("rag-agent")!;
    expect(agent.knowledgeBase).toBeDefined();
    expect(agent.knowledgeBase!.size()).toBe(1);
  });
});

import { describe, test, expect } from "bun:test";
import { createAICache } from "../../cache/ai-cache";
import { createMockCache } from "../helpers";

describe("createAICache", () => {
  test("search result cache set/get", async () => {
    const cache = createMockCache();
    const aiCache = createAICache(cache as never);

    const results = [{ path: "doc.md", title: "Doc", excerpt: "...", score: 1.0 }];
    await aiCache.setSearchResult("kb1", "hash1", results);

    const cached = await aiCache.getSearchResult("kb1", "hash1");
    expect(cached).toEqual(results);
  });

  test("returns null for missing search cache", async () => {
    const cache = createMockCache();
    const aiCache = createAICache(cache as never);

    const cached = await aiCache.getSearchResult("kb1", "missing");
    expect(cached).toBeNull();
  });

  test("agent config cache (memory)", async () => {
    const cache = createMockCache();
    const aiCache = createAICache(cache as never);

    const config = {
      id: "agent1",
      name: "Test Agent",
      systemPrompt: "You are helpful.",
      model: "gpt-4o",
      tenantId: "t1",
    };

    await aiCache.setAgentConfig("agent1", config);
    const cached = await aiCache.getAgentConfig("agent1");
    expect(cached).toEqual(config);
  });

  test("agent config invalidation", async () => {
    const cache = createMockCache();
    const aiCache = createAICache(cache as never);

    const config = {
      id: "agent1",
      name: "Test",
      systemPrompt: "prompt",
      model: "model",
      tenantId: "t1",
    };

    await aiCache.setAgentConfig("agent1", config);
    await aiCache.invalidateAgentConfig("agent1");
    const cached = await aiCache.getAgentConfig("agent1");
    expect(cached).toBeNull();
  });
});

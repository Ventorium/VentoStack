import { describe, test, expect } from "bun:test";
import { createMemoryService } from "../../memory/service";
import { createMockDatabase } from "../helpers";

describe("createMemoryService", () => {
  test("creates session and returns id", async () => {
    const { db } = createMockDatabase();
    const service = createMemoryService({ db, storagePath: "/tmp/test-memory" });

    const result = await service.createSession({
      userId: "user1",
      agentId: "agent1",
      agentConfig: {
        id: "agent1",
        name: "Test",
        systemPrompt: "prompt",
        model: "model",
        tenantId: "t1",
      },
    });
    expect(result).toBeDefined();
    expect(result.sessionId).toBeTruthy();
  });

  test("getHistory returns array", async () => {
    const { db } = createMockDatabase();
    const service = createMemoryService({ db, storagePath: "/tmp/test-memory" });

    const history = await service.getHistory("nonexistent");
    expect(Array.isArray(history)).toBe(true);
  });

  test("appendMessage does not throw", async () => {
    const { db } = createMockDatabase();
    const service = createMemoryService({ db, storagePath: "/tmp/test-memory" });

    await expect(
      service.appendMessage("session1", {
        role: "user",
        content: "Hello",
      }),
    ).resolves.toBeUndefined();
  });
});

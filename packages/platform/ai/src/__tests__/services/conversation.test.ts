import { describe, test, expect } from "bun:test";
import { createConversationService } from "../../services/conversation";
import { createMockDatabase } from "../helpers";

describe("createConversationService", () => {
  test("creates conversation", async () => {
    const { db } = createMockDatabase();
    const service = createConversationService({ db });

    const result = await service.create({
      agentId: "agent1",
      userId: "user1",
      tenantId: "tenant1",
    });
    expect(result.id).toBeTruthy();
    expect(typeof result.id).toBe("string");
  });

  test("getById returns conversation", async () => {
    const convRow = {
      id: "c1",
      agentId: "agent1",
      userId: "user1",
      title: "Test",
      status: "active",
      messageCount: 0,
      agentConfigSnapshot: null,
      tenantId: "t1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { db } = createMockDatabase({
      "WHERE id = $1 AND user_id = $2": [convRow],
    });
    const service = createConversationService({ db });

    const result = await service.getById("c1", "user1");
    expect(result?.id).toBe("c1");
    expect(result?.agentId).toBe("agent1");
  });

  test("getById returns null for missing", async () => {
    const { db } = createMockDatabase();
    const service = createConversationService({ db });

    const result = await service.getById("nonexistent", "user1");
    expect(result).toBeNull();
  });

  test("list returns array", async () => {
    const { db } = createMockDatabase({
      "WHERE user_id": [],
    });
    const service = createConversationService({ db });

    const result = await service.list({ userId: "user1", tenantId: "t1" });
    expect(Array.isArray(result)).toBe(true);
  });

  test("delete does not throw", async () => {
    const { db } = createMockDatabase();
    const service = createConversationService({ db });

    await expect(service.delete("c1", "user1")).resolves.toBeUndefined();
  });
});

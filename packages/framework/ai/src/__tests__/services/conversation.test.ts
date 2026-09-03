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

  test("list applies limit and before cursor with parameterized SQL", async () => {
    const captured: Array<{ sql: string; values: unknown[] }> = [];
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
      "WHERE user_id": [convRow],
    });
    // 包装 raw 以捕获 SQL 与参数
    const raw = db.raw.bind(db);
    (db as { raw: unknown }).raw = async (sql: string, values: unknown[]) => {
      captured.push({ sql, values });
      return raw(sql, values);
    };
    const service = createConversationService({ db });

    await service.list({
      userId: "user1",
      tenantId: "t1",
      agentId: "agent1",
      limit: 20,
      before: "2026-01-01T00:00:00.000Z",
    });

    expect(captured).toHaveLength(1);
    const { sql, values } = captured[0]!;
    expect(sql).toContain("updated_at < $4");
    expect(sql).toContain("LIMIT $5");
    expect(values).toEqual(["user1", "t1", "agent1", "2026-01-01T00:00:00.000Z", 20]);
  });

  test("list clamps limit to valid range", async () => {
    const captured: Array<{ values: unknown[] }> = [];
    const { db } = createMockDatabase({
      "WHERE user_id": [],
    });
    const raw = db.raw.bind(db);
    (db as { raw: unknown }).raw = async (sql: string, values: unknown[]) => {
      captured.push({ values });
      return raw(sql, values);
    };
    const service = createConversationService({ db });

    await service.list({ userId: "user1", tenantId: "t1", limit: 999 });
    expect(captured[0]!.values.at(-1)).toBe(100);

    await service.list({ userId: "user1", tenantId: "t1", limit: 0 });
    expect(captured[1]!.values.at(-1)).toBe(1);
  });

  test("delete does not throw", async () => {
    const { db } = createMockDatabase();
    const service = createConversationService({ db });

    await expect(service.delete("c1", "user1")).resolves.toBeUndefined();
  });
});

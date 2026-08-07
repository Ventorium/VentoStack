import { describe, test, expect } from "bun:test";
import { createKnowledgeBaseCrudService } from "../../services/knowledge-base";
import { createMockDatabase, createMockEventBus } from "../helpers";

describe("createKnowledgeBaseCrudService", () => {
  test("creates knowledge base", async () => {
    const { db } = createMockDatabase();
    const eventBus = createMockEventBus();
    const service = createKnowledgeBaseCrudService({ db, eventBus: eventBus as never });

    const result = await service.create({
      name: "Test KB",
      basePath: "/data/test",
      tenantId: "t1",
      userId: "u1",
    });
    expect(result.id).toBeTruthy();
    expect(typeof result.id).toBe("string");
  });

  test("getById returns null for missing", async () => {
    const { db } = createMockDatabase();
    const service = createKnowledgeBaseCrudService({ db });

    const result = await service.getById("nonexistent", "t1");
    expect(result).toBeNull();
  });

  test("list returns paginated results", async () => {
    const { db } = createMockDatabase({
      "COUNT(*)": [{ cnt: "5" }],
      "FROM ai_knowledge_base": [{
        id: "kb1", name: "Test", description: null, basePath: "/data",
        tenantId: "t1", createdBy: "u1", status: "active", documentCount: 0,
        createdAt: new Date(), updatedAt: new Date(),
      }],
    });
    const service = createKnowledgeBaseCrudService({ db });

    const result = await service.list({ tenantId: "t1" });
    expect(result.total).toBe(5);
    expect(Array.isArray(result.list)).toBe(true);
  });

  test("createDocument returns id", async () => {
    const { db } = createMockDatabase();
    const service = createKnowledgeBaseCrudService({ db });

    const result = await service.createDocument({
      kbId: "kb1",
      title: "Doc",
      path: "doc.md",
      content: "# Doc",
      tenantId: "t1",
      userId: "u1",
    });
    expect(result.id).toBeTruthy();
  });

  test("deleteDocument does not throw", async () => {
    const { db } = createMockDatabase({
      "WHERE id = $1 AND tenant_id = $2": [{
        id: "d1", knowledgeBaseId: "kb1", title: "Doc", path: "doc.md",
        content: "# Doc", frontmatter: null, links: null,
        tenantId: "t1", createdBy: "u1",
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }],
    });
    const service = createKnowledgeBaseCrudService({ db });

    await expect(service.deleteDocument("d1", "t1")).resolves.toBeUndefined();
  });
});

import { describe, test, expect } from "bun:test";
import { createScopedKBService } from "../../services/kb-scope";
import { createMockDatabase, createMockEventBus } from "../helpers";

describe("createScopedKBService", () => {
  test("list returns empty for new tenant", async () => {
    const { db } = createMockDatabase({
      "COUNT(*)": [{ cnt: "0" }],
    });
    const service = createScopedKBService({ db });

    const result = await service.list({ tenantId: "t1", scope: "global" });
    expect(result.total).toBe(0);
  });

  test("create returns id", async () => {
    const { db } = createMockDatabase();
    const eventBus = createMockEventBus();
    const service = createScopedKBService({ db, eventBus: eventBus as never });

    const result = await service.create({
      name: "Test KB",
      basePath: "/data/test",
      scope: "global",
      tenantId: "t1",
      userId: "u1",
    });
    expect(result.id).toBeTruthy();
    expect(typeof result.id).toBe("string");
  });

  test("personal KB with ownerId", async () => {
    const { db } = createMockDatabase();
    const eventBus = createMockEventBus();
    const service = createScopedKBService({ db, eventBus: eventBus as never });

    const result = await service.create({
      name: "My KB",
      basePath: "/data/personal/u1",
      scope: "personal",
      ownerId: "u1",
      tenantId: "t1",
      userId: "u1",
    });
    expect(result.id).toBeTruthy();
  });

  test("getById returns null for missing", async () => {
    const { db } = createMockDatabase();
    const service = createScopedKBService({ db });

    const result = await service.getById("nonexistent", "t1");
    expect(result).toBeNull();
  });

  test("listDepartments returns array", async () => {
    const { db } = createMockDatabase({
      "scope = 'department'": [{ departmentId: "dept1", cnt: "3" }],
    });
    const service = createScopedKBService({ db });

    const result = await service.listDepartments("t1");
    expect(Array.isArray(result)).toBe(true);
  });
});

import { describe, test, expect } from "bun:test";
import { createSkillService } from "../../services/skill";
import { createMockDatabase, createMockEventBus } from "../helpers";

describe("createSkillService", () => {
  test("list returns empty array for new tenant", async () => {
    const { db } = createMockDatabase({
      "COUNT(*)": [{ cnt: "0" }],
    });
    const eventBus = createMockEventBus();
    const service = createSkillService({ db, eventBus: eventBus as never });

    const result = await service.list("tenant1");
    expect(result.total).toBe(0);
    expect(Array.isArray(result.list)).toBe(true);
  });

  test("getById returns null for missing", async () => {
    const { db } = createMockDatabase();
    const service = createSkillService({ db });

    const result = await service.getById("nonexistent", "tenant1");
    expect(result).toBeNull();
  });

  test("getBySlug returns null for missing", async () => {
    const { db } = createMockDatabase();
    const service = createSkillService({ db });

    const result = await service.getBySlug("nonexistent", "tenant1");
    expect(result).toBeNull();
  });

  test("setEnabled does not throw", async () => {
    const { db } = createMockDatabase();
    const eventBus = createMockEventBus();
    const service = createSkillService({ db, eventBus: eventBus as never });

    await expect(service.setEnabled("id1", "tenant1", false)).resolves.toBeUndefined();
  });

  test("uninstall does not throw for missing", async () => {
    const { db } = createMockDatabase();
    const service = createSkillService({ db });

    await expect(service.uninstall("id1", "tenant1")).resolves.toBeUndefined();
  });
});

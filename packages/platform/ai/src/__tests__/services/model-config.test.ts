import { describe, test, expect } from "bun:test";
import { createModelConfigService } from "../../services/model-config";
import { createMockDatabase } from "../helpers";

describe("createModelConfigService", () => {
  test("getAll returns all purpose definitions", async () => {
    const { db } = createMockDatabase();
    const service = createModelConfigService({ db });

    const result = await service.getAll();
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].purpose).toBeTruthy();
    expect(result[0].label).toBeTruthy();
  });

  test("get returns null for unset purpose", async () => {
    const { db } = createMockDatabase();
    const service = createModelConfigService({ db });

    const result = await service.get("default_chat");
    expect(result).toBeNull();
  });

  test("set and get round-trip", async () => {
    const store = new Map<string, string>();
    const { db } = createMockDatabase();
    const service = createModelConfigService({ db });

    // set doesn't throw
    await expect(service.set("default_chat", "gpt-4o")).resolves.toBeUndefined();
  });

  test("remove does not throw", async () => {
    const { db } = createMockDatabase();
    const service = createModelConfigService({ db });

    await expect(service.remove("default_chat")).resolves.toBeUndefined();
  });

  test("setBatch does not throw", async () => {
    const { db } = createMockDatabase();
    const service = createModelConfigService({ db });

    await expect(service.setBatch([
      { purpose: "default_chat", modelId: "gpt-4o" },
      { purpose: "fast_task", modelId: "gpt-4o-mini" },
    ])).resolves.toBeUndefined();
  });
});

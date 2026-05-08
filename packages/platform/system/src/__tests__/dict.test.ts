/**
 * @ventostack/system - DictService 测试
 */

import { describe, expect, test } from "bun:test";
import { createDictService } from "../services/dict";
import { createMockExecutor, createMockDatabase, createTestCache } from "./helpers";

function setup() {
  const mockExec = createMockExecutor();
  const { db, registerModel, calls } = createMockDatabase(mockExec);
  registerModel("sys_dict_type", "sys_dict_type", true);
  registerModel("sys_dict_data", "sys_dict_data", true);
  const cache = createTestCache();
  const dictService = createDictService({ db, cache });
  return { dictService, executor: mockExec.executor, calls, results: mockExec.results, cache };
}

describe("DictService", () => {
  test("createType inserts dict type", async () => {
    const s = setup();
    s.results.set("INSERT", [{ id: "dt1" }]);
    const result = await s.dictService.createType({ name: "状态", code: "status" });
    expect(result.id).toBeTruthy();
  });

  test("createData inserts dict data", async () => {
    const s = setup();
    s.results.set("INSERT", [{ id: "dd1" }]);
    const result = await s.dictService.createData({
      typeCode: "status", label: "启用", value: "1",
    });
    expect(result.id).toBeTruthy();
  });

  test("listDataByType returns cached data", async () => {
    const s = setup();
    s.results.set("SELECT", [
      { id: "dd1", type_code: "status", label: "启用", value: "1", sort: 0 },
    ]);
    const data = await s.dictService.listDataByType("status");
    expect(data.length).toBe(1);
    expect(data[0].label).toBe("启用");
  });

  test("listDataByType returns empty for unknown type", async () => {
    const s = setup();
    const data = await s.dictService.listDataByType("nonexistent");
    expect(data.length).toBe(0);
  });

  test("refreshCache clears cached data", async () => {
    const s = setup();
    s.results.set("SELECT", [{ id: "dd1", type_code: "status", label: "启用", value: "1" }]);
    // First call populates cache
    await s.dictService.listDataByType("status");
    // Refresh
    await s.dictService.refreshCache("status");
    // Second call should re-query
    await s.dictService.listDataByType("status");
  });

  test("updateType updates dict type", async () => {
    const s = setup();
    await s.dictService.updateType("status", { name: "状态v2" });
    expect(s.calls.some(c => c.text.includes("UPDATE"))).toBe(true);
  });

  test("deleteType removes dict type", async () => {
    const s = setup();
    await s.dictService.deleteType("status");
    expect(s.calls.some(c => c.text.includes("DELETE"))).toBe(true);
  });
});

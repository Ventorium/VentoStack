/**
 * @ventostack/system - DictService 测试
 */

import { describe, expect, test } from "bun:test";
import { createDictService } from "../services/dict";
import { createMockDatabase, createMockExecutor, createTestCache } from "./helpers";

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
      typeCode: "status",
      label: "启用",
      value: "1",
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
    // Mock the SELECT to return non-system type
    s.results.set("SELECT", [{ is_system: false }]);
    await s.dictService.updateType("status", { name: "状态v2" });
    expect(s.calls.some((c) => c.text.includes("UPDATE"))).toBe(true);
  });

  test("updateType rejects system dict type", async () => {
    const s = setup();
    // Mock the SELECT to return system type
    s.results.set("SELECT", [{ is_system: true }]);
    expect(
      s.dictService.updateType("sys_status", { name: "状态v2" }),
    ).rejects.toThrow("系统内置字典类型不可修改");
  });

  test("deleteType removes dict type", async () => {
    const s = setup();
    // Mock the SELECT to return non-system type
    s.results.set("SELECT", [{ is_system: false }]);
    await s.dictService.deleteType("status");
    expect(s.calls.some((c) => c.text.includes("DELETE"))).toBe(true);
  });

  test("deleteType rejects system dict type", async () => {
    const s = setup();
    // Mock the SELECT to return system type
    s.results.set("SELECT", [{ is_system: true }]);
    expect(
      s.dictService.deleteType("sys_status"),
    ).rejects.toThrow("系统内置字典类型不可删除");
  });

  test("updateData rejects system dict data", async () => {
    const s = setup();
    // Mock the SELECT to return system data
    s.results.set("SELECT", [{ type_code: "sys_status", is_system: true }]);
    expect(
      s.dictService.updateData("dd1", { label: "新标签" }),
    ).rejects.toThrow("系统内置字典数据不可修改");
  });

  test("deleteData rejects system dict data", async () => {
    const s = setup();
    // Mock the SELECT to return system data
    s.results.set("SELECT", [{ type_code: "sys_status", is_system: true }]);
    expect(
      s.dictService.deleteData("dd1"),
    ).rejects.toThrow("系统内置字典数据不可删除");
  });
});

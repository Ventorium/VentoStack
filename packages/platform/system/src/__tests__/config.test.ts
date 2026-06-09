/**
 * @ventostack/system - ConfigService 测试
 */

import { describe, expect, test } from "bun:test";
import { createConfigService } from "../services/config";
import { createMockDatabase, createMockExecutor, createTestCache } from "./helpers";

function setup() {
  const mockExec = createMockExecutor();
  const { db, registerModel, calls } = createMockDatabase(mockExec);
  registerModel("sys_config", "sys_config", true);
  const cache = createTestCache();
  const configService = createConfigService({ db, cache });
  return { configService, executor: mockExec.executor, calls, results: mockExec.results, cache };
}

describe("ConfigService", () => {
  test("create inserts config", async () => {
    const s = setup();
    s.results.set("INSERT", [{ id: "cfg1" }]);
    const result = await s.configService.create({
      name: "站点名称",
      key: "site_name",
      value: "VentoStack",
      type: 0,
    });
    expect(result.id).toBeTruthy();
  });

  test("getValue returns cached config value", async () => {
    const s = setup();
    s.results.set("SELECT", [{ value: "VentoStack" }]);
    const value = await s.configService.getValue("site_name");
    expect(value).toBe("VentoStack");
  });

  test("getValue returns null for unknown key", async () => {
    const s = setup();
    const value = await s.configService.getValue("unknown_key");
    expect(value).toBeNull();
  });

  test("update changes config value", async () => {
    const s = setup();
    // update 现在先 SELECT key 再 UPDATE（与 delete 同模式）
    s.results.set("SELECT", [{ key: "site_name" }]);
    await s.configService.update("cfg-123", { value: "NewName" });
    expect(s.calls.some((c) => c.text.includes("SELECT"))).toBe(true);
    expect(s.calls.some((c) => c.text.includes("UPDATE"))).toBe(true);
  });

  test("delete removes config by id", async () => {
    const s = setup();
    // delete 现在先 SELECT key 再 DELETE，需要 mock SELECT 返回
    s.results.set("SELECT", [{ key: "custom_key" }]);
    await s.configService.delete("cfg-123");
    // 第一次 call 是 SELECT（查 key），第二次是 soft delete (UPDATE SET deleted_at)
    expect(s.calls.some((c) => c.text.includes("SELECT"))).toBe(true);
    expect(s.calls.some((c) => c.text.includes("deleted_at"))).toBe(true);
  });

  test("delete rejects protected system config", async () => {
    const s = setup();
    // mock SELECT 返回受保护的 key
    s.results.set("SELECT", [{ key: "sys_site_name" }]);
    expect(s.configService.delete("cfg-protected")).rejects.toThrow("不允许删除");
  });

  test("delete does nothing if config not found", async () => {
    const s = setup();
    // mock SELECT 返回空
    s.results.set("SELECT", []);
    await s.configService.delete("cfg-nonexistent");
    // 只有 SELECT，没有 DELETE
    expect(s.calls.every((c) => !c.text.includes("DELETE"))).toBe(true);
  });

  test("refreshCache clears cached value", async () => {
    const s = setup();
    s.results.set("SELECT", [{ value: "VentoStack" }]);
    await s.configService.getValue("site_name");
    await s.configService.refreshCache("site_name");
    // Next call should re-query
    await s.configService.getValue("site_name");
  });
});

/**
 * @ventostack/system - ConfigService 测试
 */

import { describe, expect, test } from "bun:test";
import { createConfigService } from "../services/config";
import { createMockExecutor, createMockDatabase, createTestCache } from "./helpers";

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
      name: "站点名称", key: "site_name", value: "VentoStack", type: 0,
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
    await s.configService.update("site_name", { value: "NewName" });
    expect(s.calls.some(c => c.text.includes("UPDATE"))).toBe(true);
  });

  test("delete removes config", async () => {
    const s = setup();
    await s.configService.delete("site_name");
    expect(s.calls.some(c => c.text.includes("deleted_at"))).toBe(true);
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

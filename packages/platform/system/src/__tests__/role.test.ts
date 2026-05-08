/**
 * @ventostack/system - RoleService 测试
 */

import { describe, expect, test } from "bun:test";
import { createRoleService } from "../services/role";
import { createMockExecutor, createMockDatabase, createTestCache } from "./helpers";

function setup() {
  const mockExec = createMockExecutor();
  const { db, registerModel, calls } = createMockDatabase(mockExec);
  registerModel("sys_role", "sys_role", true);
  registerModel("sys_user_role", "sys_user_role", false);
  registerModel("sys_role_menu", "sys_role_menu", false);
  registerModel("sys_role_dept", "sys_role_dept", false);
  registerModel("sys_dept", "sys_dept", true);
  const cache = createTestCache();
  const roleService = createRoleService({ db, cache });
  return { roleService, executor: mockExec.executor, calls, results: mockExec.results, cache };
}

describe("RoleService", () => {
  test("create inserts role with generated id", async () => {
    const s = setup();
    const result = await s.roleService.create({
      name: "管理员", code: "admin", sort: 1, dataScope: 1, remark: "系统管理员",
    });
    expect(result.id).toBeTruthy();
    expect(typeof result.id).toBe("string");
    expect(s.calls.some(c => c.text.includes("INSERT"))).toBe(true);
  });

  test("update executes UPDATE with changed fields", async () => {
    const s = setup();
    await s.roleService.update("r1", { name: "新名称", sort: 2 });
    expect(s.calls.some(c => c.text.includes("UPDATE"))).toBe(true);
  });

  test("update with no fields does nothing", async () => {
    const s = setup();
    await s.roleService.update("r1", {});
    expect(s.calls.length).toBe(0);
  });

  test("delete removes associations and soft-deletes role", async () => {
    const s = setup();
    await s.roleService.delete("r1");
    // Should have 3 executor calls: DELETE role_menu, DELETE user_role, UPDATE role
    expect(s.calls.length).toBe(3);
    expect(s.calls[0]!.text).toContain("sys_role_menu");
    expect(s.calls[1]!.text).toContain("sys_user_role");
    expect(s.calls[2]!.text).toContain("deleted_at");
  });

  test("getById returns role detail from db", async () => {
    const s = setup();
    s.results.set("SELECT", [{
      id: "r1", name: "管理员", code: "admin", sort: 1,
      data_scope: 1, status: 1, remark: "test", created_at: "2025-01-01", updated_at: "2025-01-01",
    }]);
    const role = await s.roleService.getById("r1");
    expect(role).not.toBeNull();
    expect(role!.name).toBe("管理员");
    expect(role!.code).toBe("admin");
  });

  test("getById returns null for non-existent role", async () => {
    const s = setup();
    const role = await s.roleService.getById("nonexistent");
    expect(role).toBeNull();
  });

  test("getById returns cached role on second call", async () => {
    const s = setup();
    s.results.set("SELECT", [{
      id: "r1", name: "管理员", code: "admin", sort: 1,
      data_scope: 1, status: 1, remark: null, created_at: "2025-01-01", updated_at: "2025-01-01",
    }]);
    const role1 = await s.roleService.getById("r1");
    expect(role1).not.toBeNull();

    // Clear results so second call won't find anything
    s.results.clear();
    const role2 = await s.roleService.getById("r1");
    expect(role2).not.toBeNull();
    expect(role2!.name).toBe("管理员");
  });

  test("list returns paginated results", async () => {
    const s = setup();
    s.results.set("COUNT", [{ count: 2 }]);
    s.results.set("SELECT", [
      { id: "r1", name: "管理员", code: "admin", sort: 1, data_scope: 1, status: 1, created_at: "2025-01-01" },
      { id: "r2", name: "用户", code: "user", sort: 2, data_scope: null, status: 1, created_at: "2025-01-01" },
    ]);
    const result = await s.roleService.list({ page: 1, pageSize: 10 });
    expect(result.items.length).toBe(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
  });

  test("list with empty result returns zero items", async () => {
    const s = setup();
    s.results.set("COUNT", [{ count: 0 }]);
    const result = await s.roleService.list({ page: 1, pageSize: 10 });
    expect(result.items.length).toBe(0);
    expect(result.total).toBe(0);
  });

  test("assignMenus deletes old and inserts new associations", async () => {
    const s = setup();
    await s.roleService.assignMenus("r1", ["m1", "m2"]);
    // First call: DELETE old associations, second: INSERT new ones
    expect(s.calls.some(c => c.text.includes("DELETE"))).toBe(true);
    expect(s.calls.some(c => c.text.includes("INSERT"))).toBe(true);
  });

  test("assignMenus with empty list only deletes", async () => {
    const s = setup();
    await s.roleService.assignMenus("r1", []);
    expect(s.calls.length).toBe(1);
    expect(s.calls[0]!.text).toContain("DELETE");
  });

  test("assignDataScope updates role data_scope", async () => {
    const s = setup();
    await s.roleService.assignDataScope("r1", 4);
    expect(s.calls.some(c => c.text.includes("data_scope"))).toBe(true);
  });

  test("assignDataScope with deptIds also manages role_dept", async () => {
    const s = setup();
    await s.roleService.assignDataScope("r1", 5, ["d1", "d2"]);
    // UPDATE role + DELETE role_dept + INSERT role_dept
    expect(s.calls.length).toBe(3);
    expect(s.calls.some(c => c.text.includes("sys_role_dept"))).toBe(true);
  });
});

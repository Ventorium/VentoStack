/**
 * @ventostack/system - 权限安全回归测试
 *
 * 覆盖：RBAC 权限校验、数据权限范围、无权限拒绝
 */

import { describe, expect, test } from "bun:test";
import { createMockExecutor, createMockDatabase, createTestCache, createMockRBAC, createMockRowFilter } from "../helpers";
import { createRoleService } from "../../services/role";
import { createPermissionLoader } from "../../services/permission-loader";
import { createMenuTreeBuilder } from "../../services/menu-tree-builder";

function setupRole() {
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

function setupPermissionLoader() {
  const mockExec = createMockExecutor();
  const { db, registerModel, calls } = createMockDatabase(mockExec);
  registerModel("sys_role", "sys_role", true);
  registerModel("sys_role_menu", "sys_role_menu", false);
  registerModel("sys_menu", "sys_menu", true);
  const rbac = createMockRBAC();
  const rowFilter = createMockRowFilter();
  const loader = createPermissionLoader({ db, rbac, rowFilter });
  return { loader, executor: mockExec.executor, calls, results: mockExec.results, rbac, rowFilter };
}

function setupMenuTreeBuilder() {
  const mockExec = createMockExecutor();
  const { db, registerModel, calls } = createMockDatabase(mockExec);
  registerModel("sys_user_role", "sys_user_role", false);
  registerModel("sys_role", "sys_role", true);
  registerModel("sys_role_menu", "sys_role_menu", false);
  registerModel("sys_menu", "sys_menu", true);
  const builder = createMenuTreeBuilder({ db });
  return { builder, executor: mockExec.executor, calls, results: mockExec.results };
}

describe("Security: Permission", () => {
  describe("RBAC 权限加载", () => {
    test("loadAll 从数据库加载角色-菜单权限到 RBAC 引擎", async () => {
      const s = setupPermissionLoader();

      // Mock 角色列表
      s.results.set("sys_role", [
        { id: "r1", code: "admin" },
        { id: "r2", code: "user" },
      ]);
      // Mock 角色-菜单关联
      s.results.set("sys_role_menu", [
        { role_id: "r1", menu_id: "m1" },
        { role_id: "r1", menu_id: "m2" },
        { role_id: "r2", menu_id: "m1" },
      ]);
      // Mock 菜单权限标识
      s.results.set("sys_menu", [
        { id: "m1", perms: "system:user:list" },
        { id: "m2", perms: "system:user:create" },
      ]);

      await s.loader.loadAll();

      // RBAC 应该被调用添加角色
      expect(s.rbac.addRole).toHaveBeenCalled();
    });

    test("空数据库不崩溃", async () => {
      const s = setupPermissionLoader();
      // 所有查询返回空
      await s.loader.loadAll();
      // 不应抛出异常
    });
  });

  describe("数据权限范围", () => {
    test("assignDataScope 更新角色数据范围", async () => {
      const s = setupRole();
      await s.roleService.assignDataScope("r1", 2); // 2 = 自定义数据权限
      expect(s.calls.some(c => c.text.includes("data_scope"))).toBe(true);
    });

    test("assignDataScope 自定义范围时关联部门", async () => {
      const s = setupRole();
      await s.roleService.assignDataScope("r1", 5, ["d1", "d2", "d3"]);
      // UPDATE role + DELETE role_dept + INSERT role_dept
      expect(s.calls.length).toBe(3);
      expect(s.calls.some(c => c.text.includes("sys_role_dept"))).toBe(true);
      expect(s.calls.some(c => c.text.includes("INSERT"))).toBe(true);
    });

    test("assignDataScope 不提供 deptIds 时不操作关联表", async () => {
      const s = setupRole();
      await s.roleService.assignDataScope("r1", 1); // 1 = 全部数据
      // 只有 UPDATE，没有 DELETE/INSERT role_dept
      expect(s.calls.length).toBe(1);
      expect(s.calls[0]!.text).toContain("UPDATE");
    });
  });

  describe("菜单权限分配", () => {
    test("assignMenus 原子替换（先删后插）", async () => {
      const s = setupRole();
      await s.roleService.assignMenus("r1", ["m1", "m2", "m3"]);
      // 第一条: DELETE, 第二条: INSERT
      expect(s.calls.length).toBe(2);
      expect(s.calls[0]!.text).toContain("DELETE");
      expect(s.calls[0]!.text).toContain("sys_role_menu");
      expect(s.calls[1]!.text).toContain("INSERT");
      expect(s.calls[1]!.text).toContain("sys_role_menu");
    });

    test("assignMenus 空列表只删除不插入", async () => {
      const s = setupRole();
      await s.roleService.assignMenus("r1", []);
      expect(s.calls.length).toBe(1);
      expect(s.calls[0]!.text).toContain("DELETE");
    });
  });

  describe("菜单树权限生成", () => {
    test("buildPermissionsForUser 返回权限标识列表", async () => {
      const s = setupMenuTreeBuilder();
      // Mock 用户角色
      s.results.set("sys_user_role", [{ role_id: "r1" }]);
      // Mock 角色菜单
      s.results.set("sys_role_menu", [{ menu_id: "m1" }, { menu_id: "m2" }]);
      // Mock 菜单权限
      s.results.set("sys_menu", [
        { id: "m1", perms: "system:user:list", menu_type: "F" },
        { id: "m2", perms: "system:user:create", menu_type: "F" },
      ]);

      const perms = await s.builder.buildPermissionsForUser("u1");
      expect(Array.isArray(perms)).toBe(true);
    });

    test("无角色用户返回空权限列表", async () => {
      const s = setupMenuTreeBuilder();
      // 用户无角色
      s.results.set("sys_user_role", []);

      const perms = await s.builder.buildPermissionsForUser("u1");
      expect(perms).toEqual([]);
    });

    test("buildRoutesForUser 返回菜单树", async () => {
      const s = setupMenuTreeBuilder();
      s.results.set("sys_user_role", [{ role_id: "r1" }]);
      s.results.set("sys_role_menu", [{ menu_id: "m1" }]);
      s.results.set("sys_menu", [{
        id: "m1", parent_id: "0", name: "系统管理", path: "/system",
        component: "Layout", icon: "setting", sort: 1, menu_type: "M",
        visible: 1, status: 1, perms: "",
      }]);

      const routes = await s.builder.buildRoutesForUser("u1");
      expect(Array.isArray(routes)).toBe(true);
    });
  });

  describe("角色删除级联清理", () => {
    test("删除角色时清理关联数据", async () => {
      const s = setupRole();
      await s.roleService.delete("r1");
      // 应该有 3 条 SQL: DELETE role_menu, DELETE user_role, UPDATE role (soft delete)
      expect(s.calls.length).toBe(3);
      expect(s.calls[0]!.text).toContain("sys_role_menu");
      expect(s.calls[1]!.text).toContain("sys_user_role");
      expect(s.calls[2]!.text).toContain("deleted_at");
    });
  });

  describe("SQL 注入防护", () => {
    test("用户名搜索参数化查询（不拼接 SQL）", async () => {
      const mockExec = createMockExecutor();
      const { db, registerModel, calls } = createMockDatabase(mockExec);
      registerModel("sys_user", "sys_user", true);
      registerModel("sys_user_role", "sys_user_role", false);
      registerModel("sys_role", "sys_role", true);
      const { createUserService } = await import("../../services/user");
      const { createMockPasswordHasher } = await import("../helpers");
      const cache = createTestCache();
      const passwordHasher = createMockPasswordHasher();

      const userService = createUserService({ db, passwordHasher, cache });
      mockExec.results.set("COUNT", [{ total: 0 }]);

      // 尝试 SQL 注入
      await userService.list({ username: "'; DROP TABLE sys_user; --" });

      // 验证参数化传递，而非字符串拼接
      const selectCall = calls.find(c => c.text.includes("LIKE"));
      if (selectCall) {
        expect(selectCall.params).toContain("%'; DROP TABLE sys_user; --%");
      }
    });
  });
});

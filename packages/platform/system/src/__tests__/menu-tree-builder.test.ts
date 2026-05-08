/**
 * @ventostack/system - MenuTreeBuilder 测试
 */

import { describe, expect, test } from "bun:test";
import { createMenuTreeBuilder } from "../services/menu-tree-builder";
import { createMockExecutor, createMockDatabase } from "./helpers";

function setup() {
  const mockExec = createMockExecutor();
  const { db, registerModel, calls } = createMockDatabase(mockExec);
  registerModel("sys_user_role", "sys_user_role", false);
  registerModel("sys_role", "sys_role", true);
  registerModel("sys_role_menu", "sys_role_menu", false);
  registerModel("sys_menu", "sys_menu", true);
  const menuTreeBuilder = createMenuTreeBuilder({ db });
  return { menuTreeBuilder, executor: mockExec.executor, calls, results: mockExec.results };
}

describe("MenuTreeBuilder", () => {
  test("buildRoutesForUser returns empty array when user has no roles", async () => {
    const s = setup();
    const routes = await s.menuTreeBuilder.buildRoutesForUser("u1");
    expect(routes).toEqual([]);
  });

  test("buildRoutesForUser returns routes for user with assigned menus", async () => {
    const s = setup();
    // 1. user -> roles
    s.results.set("FROM sys_user_role", [{ role_id: "r1" }]);
    // 2. active roles (use specific pattern to avoid matching sys_role_menu)
    s.results.set("FROM sys_role WHERE", [{ id: "r1" }]);
    // 3. role -> menus
    s.results.set("FROM sys_role_menu", [{ menu_id: "m1" }, { menu_id: "m2" }]);
    // 4. all menus
    s.results.set("FROM sys_menu WHERE status", [
      { id: "m1", parent_id: null, name: "系统管理", path: "/system", component: "Layout", redirect: "", type: 1, permission: "", icon: "setting", sort: 1, visible: true },
      { id: "m2", parent_id: "m1", name: "用户管理", path: "/system/user", component: "UserList", redirect: "", type: 2, permission: "system:user:list", icon: "user", sort: 1, visible: true },
    ]);

    const routes = await s.menuTreeBuilder.buildRoutesForUser("u1");
    expect(routes.length).toBe(1);
    expect(routes[0]!.name).toBe("系统管理");
    expect(routes[0]!.children!.length).toBe(1);
    expect(routes[0]!.children![0]!.name).toBe("用户管理");
  });

  test("buildRoutesForUser includes button permissions in meta", async () => {
    const s = setup();
    s.results.set("FROM sys_user_role", [{ role_id: "r1" }]);
    s.results.set("FROM sys_role WHERE", [{ id: "r1" }]);
    s.results.set("FROM sys_role_menu", [{ menu_id: "m1" }, { menu_id: "m2" }, { menu_id: "m3" }]);
    s.results.set("FROM sys_menu WHERE status", [
      { id: "m1", parent_id: null, name: "系统管理", path: "/system", component: "Layout", redirect: "", type: 1, permission: "", icon: "", sort: 1, visible: true },
      { id: "m2", parent_id: "m1", name: "用户管理", path: "/system/user", component: "UserList", redirect: "", type: 2, permission: "system:user:list", icon: "", sort: 1, visible: true },
      { id: "m3", parent_id: "m2", name: "新增用户", path: "", component: "", redirect: "", type: 3, permission: "system:user:create", icon: "", sort: 1, visible: true },
    ]);

    const routes = await s.menuTreeBuilder.buildRoutesForUser("u1");
    expect(routes.length).toBe(1);
    const userMenu = routes[0]!.children![0]!;
    expect(userMenu.meta.permissions).toContain("system:user:create");
  });

  test("buildPermissionsForUser returns empty array when no roles", async () => {
    const s = setup();
    const permissions = await s.menuTreeBuilder.buildPermissionsForUser("u1");
    expect(permissions).toEqual([]);
  });

  test("buildPermissionsForUser returns button permissions", async () => {
    const s = setup();
    s.results.set("FROM sys_user_role", [{ role_id: "r1" }]);
    s.results.set("FROM sys_role WHERE", [{ id: "r1" }]);
    s.results.set("FROM sys_role_menu", [{ menu_id: "m1" }]);
    s.results.set("FROM sys_menu WHERE status", [
      { id: "m1", parent_id: null, name: "新增", path: "", component: "", redirect: "", type: 3, permission: "system:user:create", icon: "", sort: 1, visible: true },
    ]);

    const permissions = await s.menuTreeBuilder.buildPermissionsForUser("u1");
    expect(permissions).toContain("system:user:create");
  });

  test("buildRoutesForUser auto-includes parent directories", async () => {
    const s = setup();
    s.results.set("FROM sys_user_role", [{ role_id: "r1" }]);
    s.results.set("FROM sys_role WHERE", [{ id: "r1" }]);
    // User only has access to a child menu (m2), parent (m1) should be auto-included
    s.results.set("FROM sys_role_menu", [{ menu_id: "m2" }]);
    s.results.set("FROM sys_menu WHERE status", [
      { id: "m1", parent_id: null, name: "系统管理", path: "/system", component: "Layout", redirect: "", type: 1, permission: "", icon: "", sort: 1, visible: true },
      { id: "m2", parent_id: "m1", name: "用户管理", path: "/system/user", component: "UserList", redirect: "", type: 2, permission: "", icon: "", sort: 1, visible: true },
    ]);

    const routes = await s.menuTreeBuilder.buildRoutesForUser("u1");
    expect(routes.length).toBe(1);
    expect(routes[0]!.name).toBe("系统管理");
    expect(routes[0]!.children!.length).toBe(1);
  });
});

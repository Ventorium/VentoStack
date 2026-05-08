import { describe, test, expect } from "bun:test";
import { createMockExecutor, createMockDatabase } from "./helpers";
import { UserRoleModel, RoleModel, RoleMenuModel, MenuModel } from "../models";

describe("debug", () => {
  test("full flow step by step", async () => {
    const mockExec = createMockExecutor();
    const { db, registerModel } = createMockDatabase(mockExec);
    registerModel("sys_user_role", "sys_user_role", false);
    registerModel("sys_role", "sys_role", true);
    registerModel("sys_role_menu", "sys_role_menu", false);
    registerModel("sys_menu", "sys_menu", true);
    
    mockExec.results.set("sys_user_role", [{ role_id: "r1" }]);
    mockExec.results.set("sys_role_menu", [{ menu_id: "m1" }]);
    mockExec.results.set("sys_role", [{ id: "r1" }]);
    mockExec.results.set("FROM sys_menu WHERE status", [
      { id: "m1", parent_id: null, name: "系统管理", path: "/system", component: "Layout", redirect: "", type: 1, permission: "", icon: "setting", sort: 1, visible: true },
    ]);
    
    // Step 1: queryUserMenuIds
    const userRoles = await db.query(UserRoleModel)
      .where("user_id", "=", "u1")
      .select("role_id")
      .list();
    console.log("Step 1 - userRoles:", JSON.stringify(userRoles));
    
    const roleIds = userRoles.map((ur: any) => ur.role_id);
    console.log("Step 1 - roleIds:", roleIds);
    
    const activeRoles = await db.query(RoleModel)
      .where("id", "IN", roleIds)
      .where("status", "=", 1)
      .select("id")
      .list();
    console.log("Step 2 - activeRoles:", JSON.stringify(activeRoles));
    
    const activeRoleIds = activeRoles.map((r: any) => r.id);
    console.log("Step 2 - activeRoleIds:", activeRoleIds);
    
    const roleMenus = await db.query(RoleMenuModel)
      .where("role_id", "IN", activeRoleIds)
      .select("menu_id")
      .list();
    console.log("Step 3 - roleMenus:", JSON.stringify(roleMenus));
    
    const menuIds = new Set(roleMenus.map((rm: any) => rm.menu_id));
    console.log("Step 3 - menuIds:", [...menuIds]);
    
    // Step 4: queryAllMenus
    const allMenus = await db.query(MenuModel)
      .where("status", "=", 1)
      .select("id", "parent_id", "name", "path", "component", "redirect", "type", "permission", "icon", "sort", "visible")
      .orderBy("sort", "ASC")
      .list();
    console.log("Step 4 - allMenus:", JSON.stringify(allMenus));
    
    expect(allMenus.length).toBe(1);
    expect(menuIds.has("m1")).toBe(true);
  });
});

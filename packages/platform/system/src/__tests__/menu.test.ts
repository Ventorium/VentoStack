/**
 * @ventostack/system - MenuService 测试
 */

import { describe, expect, test } from "bun:test";
import { createMenuService } from "../services/menu";
import { createMockExecutor, createMockDatabase } from "./helpers";

function setup() {
  const mockExec = createMockExecutor();
  const { db, registerModel, calls } = createMockDatabase(mockExec);
  registerModel("sys_menu", "sys_menu", true);
  const menuService = createMenuService({ db });
  return { menuService, executor: mockExec.executor, calls, results: mockExec.results };
}

describe("MenuService", () => {
  test("create inserts menu with generated id", async () => {
    const s = setup();
    const result = await s.menuService.create({
      parentId: null, name: "系统管理", path: "/system", component: "Layout",
      redirect: "", type: 1, permission: "", icon: "setting", sort: 1, visible: true,
    });
    expect(result.id).toBeTruthy();
    expect(s.calls.some(c => c.text.includes("INSERT"))).toBe(true);
  });

  test("update executes UPDATE with changed fields", async () => {
    const s = setup();
    await s.menuService.update("m1", { name: "新名称", sort: 3 });
    expect(s.calls.some(c => c.text.includes("UPDATE"))).toBe(true);
  });

  test("update with no fields does nothing", async () => {
    const s = setup();
    await s.menuService.update("m1", {});
    expect(s.calls.length).toBe(0);
  });

  test("delete removes children, associations and menu itself", async () => {
    const s = setup();
    await s.menuService.delete("m1");
    // 3 calls: DELETE children, DELETE role_menu, DELETE menu
    expect(s.calls.length).toBe(3);
    expect(s.calls[0]!.text).toContain("parent_id");
    expect(s.calls[1]!.text).toContain("sys_role_menu");
    expect(s.calls[2]!.text).toContain("DELETE");
  });

  test("getTree builds hierarchical structure", async () => {
    const s = setup();
    s.results.set("SELECT", [
      { id: "m1", parent_id: null, name: "系统管理", path: "/system", component: "Layout", redirect: "", type: 1, permission: "", icon: "setting", sort: 1, visible: true, status: 1 },
      { id: "m2", parent_id: "m1", name: "用户管理", path: "/system/user", component: "UserList", redirect: "", type: 2, permission: "system:user:list", icon: "user", sort: 1, visible: true, status: 1 },
      { id: "m3", parent_id: "m1", name: "角色管理", path: "/system/role", component: "RoleList", redirect: "", type: 2, permission: "system:role:list", icon: "peoples", sort: 2, visible: true, status: 1 },
    ]);
    const tree = await s.menuService.getTree();
    expect(tree.length).toBe(1);
    expect(tree[0]!.name).toBe("系统管理");
    expect(tree[0]!.children.length).toBe(2);
    expect(tree[0]!.children[0]!.name).toBe("用户管理");
    expect(tree[0]!.children[1]!.name).toBe("角色管理");
  });

  test("getTree with empty data returns empty array", async () => {
    const s = setup();
    const tree = await s.menuService.getTree();
    expect(tree).toEqual([]);
  });

  test("getTree sorts by sort field", async () => {
    const s = setup();
    s.results.set("SELECT", [
      { id: "m2", parent_id: null, name: "第二", path: "/two", component: "", redirect: "", type: 1, permission: "", icon: "", sort: 2, visible: true, status: 1 },
      { id: "m1", parent_id: null, name: "第一", path: "/one", component: "", redirect: "", type: 1, permission: "", icon: "", sort: 1, visible: true, status: 1 },
    ]);
    const tree = await s.menuService.getTree();
    expect(tree[0]!.name).toBe("第一");
    expect(tree[1]!.name).toBe("第二");
  });

  test("getTree handles orphaned nodes as roots", async () => {
    const s = setup();
    s.results.set("SELECT", [
      { id: "m1", parent_id: null, name: "根", path: "/", component: "", redirect: "", type: 1, permission: "", icon: "", sort: 1, visible: true, status: 1 },
      { id: "m2", parent_id: "nonexistent", name: "孤儿", path: "/orphan", component: "", redirect: "", type: 2, permission: "", icon: "", sort: 1, visible: true, status: 1 },
    ]);
    const tree = await s.menuService.getTree();
    // Orphaned node becomes a root since parent not in map
    expect(tree.length).toBe(2);
  });

  test("getById returns menu from tree", async () => {
    const s = setup();
    // First call: check if menu exists; second call: get all menus for tree building
    s.results.set("SELECT", [
      { id: "m1", parent_id: null, name: "系统管理", path: "/system", component: "Layout", redirect: "", type: 1, permission: "", icon: "setting", sort: 1, visible: true, status: 1 },
    ]);
    const menu = await s.menuService.getById("m1");
    expect(menu).not.toBeNull();
    expect(menu!.name).toBe("系统管理");
  });

  test("getById returns null for non-existent menu", async () => {
    const s = setup();
    const menu = await s.menuService.getById("nonexistent");
    expect(menu).toBeNull();
  });
});

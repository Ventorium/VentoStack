/**
 * @ventostack/system - PermissionLoader 测试
 */

import { describe, expect, test } from "bun:test";
import { createPermissionLoader } from "../services/permission-loader";
import { createMockExecutor, createMockDatabase, createMockRBAC, createMockRowFilter } from "./helpers";

function setup() {
  const mockExec = createMockExecutor();
  const { db, registerModel, calls } = createMockDatabase(mockExec);
  registerModel("sys_role", "sys_role", true);
  registerModel("sys_role_menu", "sys_role_menu", false);
  registerModel("sys_menu", "sys_menu", true);
  const rbac = createMockRBAC();
  const rowFilter = createMockRowFilter();
  const permissionLoader = createPermissionLoader({ db, rbac, rowFilter });
  return { permissionLoader, executor: mockExec.executor, calls, results: mockExec.results, rbac, rowFilter };
}

describe("PermissionLoader", () => {
  test("loadAll loads all roles and their permissions", async () => {
    const s = setup();
    // First query: get all enabled roles
    // Second query per role: get menu permissions
    // Third query: get data scope rules
    let callCount = 0;
    s.results.clear();
    const originalExecutor = s.executor;

    // Override to handle sequential calls
    const mockResults: Map<string, unknown[]> = new Map();
    mockResults.set("sys_role WHERE status", [
      { id: "r1", code: "admin" },
      { id: "r2", code: "user" },
    ]);
    mockResults.set("sys_role_menu", [
      { permission: "system:user:list" },
      { permission: "system:role:list" },
    ]);
    mockResults.set("data_scope", []);

    let queryIndex = 0;
    const orderedResults = [
      [{ id: "r1", code: "admin" }, { id: "r2", code: "user" }], // loadAll role query
      [{ permission: "system:user:list" }], // admin permissions
      [{ permission: "system:role:list" }], // user permissions
      [], // data scope rules
    ];

    // We need to use the results Map approach but with sequential ordering
    // Use the pattern-based approach instead
    s.results.set("sys_role WHERE status", [
      { id: "r1", code: "admin" },
    ]);
    s.results.set("sys_role_menu", [
      { permission: "system:user:list" },
    ]);
    s.results.set("data_scope IS NOT NULL", []);

    await s.permissionLoader.loadAll();
    expect(s.rbac.addRole).toHaveBeenCalled();
  });

  test("loadAll with no roles still completes", async () => {
    const s = setup();
    s.results.set("sys_role WHERE status", []);
    s.results.set("data_scope IS NOT NULL", []);
    await s.permissionLoader.loadAll();
    // No roles to add
    expect(s.rbac.addRole).not.toHaveBeenCalled();
  });

  test("reloadRole reloads specific role permissions", async () => {
    const s = setup();
    s.results.set("code = $1", [{ id: "r1" }]);
    s.results.set("sys_role_menu", [
      { permission: "system:user:create" },
    ]);
    await s.permissionLoader.reloadRole("admin");
    expect(s.rbac.addRole).toHaveBeenCalled();
  });

  test("reloadRole removes role if not found", async () => {
    const s = setup();
    // No roles found for the given code
    await s.permissionLoader.reloadRole("nonexistent");
    expect(s.rbac.removeRole).toHaveBeenCalledWith("nonexistent");
  });

  test("reloadAll clears existing roles and reloads", async () => {
    const s = setup();
    s.results.set("sys_role WHERE status", [{ id: "r1", code: "admin" }]);
    s.results.set("sys_role_menu", [{ permission: "system:user:list" }]);
    s.results.set("data_scope IS NOT NULL", []);

    await s.permissionLoader.reloadAll();
    // Should clear existing roles first
    expect(s.rbac.listRoles).toHaveBeenCalled();
  });

  test("data_scope=4 adds created_by filter rule", async () => {
    const s = setup();
    s.results.set("code, data_scope", [
      { code: "self_only", data_scope: 4 },
    ]);
    s.results.set("id, code", []);
    await s.permissionLoader.loadAll();
    expect(s.rowFilter.addRule).toHaveBeenCalled();
  });
});

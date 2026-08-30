/**
 * @ventostack/system - RBAC 权限链路集成测试
 *
 * 验证「种子权限串 → parsePermission → rbac.addRole → hasPermission」整条链路，
 * 确保路由 perm 调用与菜单权限串格式一致（resource=module:entity, action=action）。
 * 使用真实 createRBAC（非 mock），防止权限语义漂移。
 */

import { describe, expect, test } from "bun:test";
import { createRBAC } from "@ventostack/auth";
import { createPermissionLoader } from "../services/permission-loader";
import { createMockDatabase, createMockExecutor, createMockRowFilter } from "./helpers";

/**
 * 模拟数据库中的角色-菜单权限数据。
 * 权限串格式与 apps/admin/api/src/database/seeds/001_init_admin.ts 保持一致：
 * module:entity:action（如 system:user:list / scheduler:job:create）
 */
function setup() {
  const mockExec = createMockExecutor();
  const { db, registerModel } = createMockDatabase(mockExec);
  registerModel("sys_role", "sys_role", true);
  registerModel("sys_role_menu", "sys_role_menu", false);
  registerModel("sys_menu", "sys_menu", true);
  const rbac = createRBAC();
  const rowFilter = createMockRowFilter();
  const permissionLoader = createPermissionLoader({ db, rbac, rowFilter });
  return { permissionLoader, executor: mockExec.executor, results: mockExec.results, rbac, rowFilter };
}

/**
 * 预设 loadAll 需要的数据：
 * - sys_role_menu 查询（role_id → menu_id）
 * - sys_menu 查询（menu_id → permission）
 * - data_scope 查询（角色数据范围）
 */
function seedPermissions(
  results: Map<string, unknown[]>,
  roleRows: Array<{ id: string; code: string }>,
  roleMenus: Array<{ role_id: string; menu_id: string }>,
  menus: Array<{ id: string; permission: string | null }>,
) {
  results.clear();
  // loadAll 第一步：查所有启用角色
  results.set("sys_role WHERE status", roleRows);
  // 按角色查角色-菜单关联（permission-loader 用 query 构建器，表名匹配即可）
  results.set("sys_role_menu", roleMenus);
  // 菜单权限查询
  results.set("sys_menu", menus);
  // 数据范围查询返回空（不注册行过滤规则）
  results.set("data_scope", []);
}

describe("RBAC 权限链路（真实 RBAC，禁止 mock）", () => {
  test("system 模块：system:user:list → hasPermission('system:user', 'list') 命中", async () => {
    const s = setup();
    seedPermissions(
      s.results,
      [{ id: "r1", code: "user" }],
      [{ role_id: "r1", menu_id: "m1" }, { role_id: "r1", menu_id: "m2" }, { role_id: "r1", menu_id: "m3" }],
      [
        { id: "m1", permission: "system:user:list" },
        { id: "m2", permission: "system:user:create" },
        { id: "m3", permission: "system:user:query" },
      ],
    );

    await s.permissionLoader.loadAll();

    // 与路由 perm 调用一致：perm("system:user", "list")
    expect(s.rbac.hasPermission("user", "system:user", "list")).toBe(true);
    expect(s.rbac.hasPermission("user", "system:user", "create")).toBe(true);
    expect(s.rbac.hasPermission("user", "system:user", "query")).toBe(true);
    // 未授权动作
    expect(s.rbac.hasPermission("user", "system:user", "delete")).toBe(false);
  });

  test("跨模块：scheduler:job:create → hasPermission('scheduler:job', 'create') 命中", async () => {
    const s = setup();
    seedPermissions(
      s.results,
      [{ id: "r1", code: "user" }],
      [{ role_id: "r1", menu_id: "m1" }],
      [{ id: "m1", permission: "scheduler:job:create" }],
    );

    await s.permissionLoader.loadAll();

    expect(s.rbac.hasPermission("user", "scheduler:job", "create")).toBe(true);
    // 旧的两段式格式（resource="scheduler", action="job:create"）必须不命中
    expect(s.rbac.hasPermission("user", "scheduler", "job:create")).toBe(false);
  });

  test("notification/oss：与路由 perm 调用完全一致", async () => {
    const s = setup();
    seedPermissions(
      s.results,
      [{ id: "r1", code: "user" }],
      [{ role_id: "r1", menu_id: "m1" }, { role_id: "r1", menu_id: "m2" }, { role_id: "r1", menu_id: "m3" }],
      [
        { id: "m1", permission: "notification:message:send" },
        { id: "m2", permission: "oss:file:upload" },
        { id: "m3", permission: "notification:template:create" },
      ],
    );

    await s.permissionLoader.loadAll();

    expect(s.rbac.hasPermission("user", "notification:message", "send")).toBe(true);
    expect(s.rbac.hasPermission("user", "oss:file", "upload")).toBe(true);
    expect(s.rbac.hasPermission("user", "notification:template", "create")).toBe(true);
  });
});

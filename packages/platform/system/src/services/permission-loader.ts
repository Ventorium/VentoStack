/**
 * @ventostack/system - PermissionLoader
 * 权限加载器：从数据库加载角色与菜单权限到 RBAC 引擎
 * 支持全量加载、按角色重新加载
 */

import type { RBAC } from '@ventostack/auth';
import type { Database } from '@ventostack/database';
import { MenuModel, RoleMenuModel, RoleModel } from '../models';

/** 权限字符串解析结果 */
interface ParsedPermission {
  resource: string;
  action: string;
}

/** 权限加载器接口 */
export interface PermissionLoader {
  /** 加载所有角色及其权限到 RBAC 引擎 */
  loadAll(): Promise<void>;
  /** 重新加载指定角色的权限 */
  reloadRole(roleCode: string): Promise<void>;
  /** 重新加载所有角色 */
  reloadAll(): Promise<void>;
}

/**
 * 解析权限字符串为资源+动作
 * 权限字符串格式："module:entity:action"
 * @param permission 权限字符串
 * @returns 解析结果
 */
function parsePermission(permission: string): ParsedPermission | null {
  if (!permission) return null;

  const parts = permission.split(':');
  if (parts.length < 2) return null;

  // "module:entity:action" -> resource = "module:entity", action = "action"
  // "entity:action" -> resource = "entity", action = "action"
  const action = parts[parts.length - 1]!;
  const resource = parts.slice(0, -1).join(':');

  return { resource, action };
}

/**
 * 创建权限加载器实例
 * @param deps 依赖项
 * @returns 权限加载器实例
 */
export function createPermissionLoader(deps: {
  db: Database;
  rbac: RBAC;
}): PermissionLoader {
  const { db, rbac } = deps;

  /**
   * 加载指定角色的权限
   * @param roleId 角色 ID
   * @param roleCode 角色编码
   */
  async function loadRolePermissions(roleId: string, roleCode: string): Promise<void> {
    // 查询角色关联的菜单 ID
    const roleMenus = await db
      .query(RoleMenuModel)
      .where('role_id', '=', roleId)
      .select('menu_id')
      .list();

    if (roleMenus.length === 0) {
      rbac.addRole({ name: roleCode, permissions: [] });
      return;
    }

    const menuIds = roleMenus.map((rm) => rm.menu_id);

    // 查询菜单权限
    const menus = await db
      .query(MenuModel)
      .where('id', 'IN', menuIds)
      .where('status', '=', 1)
      .where('permission', 'IS NOT NULL')
      .select('permission')
      .list();

    const permissions = menus
      .map((row) => (row.permission ? parsePermission(row.permission) : null))
      .filter((p): p is ParsedPermission => p !== null);

    // 注册角色到 RBAC
    rbac.addRole({
      name: roleCode,
      permissions: permissions.map((p) => ({
        resource: p.resource,
        action: p.action,
      })),
    });
  }

  return {
    async loadAll() {
      // 1. 查询所有启用角色
      const roles = await db.query(RoleModel).where('status', '=', 1).select('id', 'code').list();

      // 2. 为每个角色加载权限
      for (const role of roles) {
        await loadRolePermissions(role.id, role.code);
      }

      // 数据范围由请求级 DataScopeResolver 解析，不能注册为跨用户的全局 RowFilter 规则。
    },

    async reloadRole(roleCode) {
      // 查询角色
      const role = await db
        .query(RoleModel)
        .where('code', '=', roleCode)
        .where('status', '=', 1)
        .select('id')
        .get();

      if (!role) {
        // 角色不存在或已禁用，从 RBAC 中移除
        rbac.removeRole(roleCode);
        return;
      }

      await loadRolePermissions(role.id, roleCode);
    },

    async reloadAll() {
      // 清除所有现有角色
      const existingRoles = rbac.listRoles();
      for (const role of existingRoles) {
        rbac.removeRole(role.name);
      }

      // 重新加载
      await this.loadAll();
    },
  };
}

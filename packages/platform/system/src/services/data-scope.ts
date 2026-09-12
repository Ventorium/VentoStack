import type { AuthUser } from '@ventostack/auth';
import { VentoStackError } from '@ventostack/core';
import type { Database } from '@ventostack/database';
import { DeptModel } from '../models/dept';
import { RoleDeptModel, RoleModel, UserRoleModel } from '../models/role';
import { UserModel } from '../models/user';
import { DataScope } from './role';

export interface ResolvedDataScope {
  all: boolean;
  departmentIds: string[];
  self: boolean;
  userId: string;
}

export class DataScopeResolutionError extends VentoStackError {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super('数据权限暂时不可用', 503, 'DATA_SCOPE_RESOLUTION_FAILED');
    this.name = 'DataScopeResolutionError';
    this.cause = cause;
  }
}

export function mergeDataScopes(
  userId: string,
  userDeptId: string | null,
  roles: Array<{ id: string; dataScope: number | null }>,
  customDepartments: Map<string, string[]>,
  descendants: Map<string, string[]>,
): ResolvedDataScope {
  if (roles.some((role) => role.dataScope === DataScope.ALL)) {
    return { all: true, departmentIds: [], self: true, userId };
  }

  const departmentIds = new Set<string>();
  let self = false;
  for (const role of roles) {
    switch (role.dataScope) {
      case DataScope.DEPARTMENT:
        if (userDeptId) departmentIds.add(userDeptId);
        break;
      case DataScope.DEPARTMENT_AND_DESCENDANTS:
        if (userDeptId) {
          departmentIds.add(userDeptId);
          for (const id of descendants.get(userDeptId) ?? []) departmentIds.add(id);
        }
        break;
      case DataScope.SELF:
        self = true;
        break;
      case DataScope.CUSTOM_DEPARTMENTS:
        for (const id of customDepartments.get(role.id) ?? []) departmentIds.add(id);
        break;
    }
  }
  return { all: false, departmentIds: [...departmentIds], self, userId };
}

export interface DataScopeResolver {
  resolve(user: AuthUser): Promise<ResolvedDataScope>;
  canAccessUser(user: AuthUser, targetUserId: string): Promise<boolean>;
  canMutateUser(user: AuthUser, targetUserId: string): Promise<boolean>;
  canAssignDepartment(user: AuthUser, departmentId: string | undefined): Promise<boolean>;
}

export function createDataScopeResolver(db: Database): DataScopeResolver {
  async function hasActiveAdminRole(userId: string): Promise<boolean> {
    const links = await db
      .query(UserRoleModel)
      .where('user_id', '=', userId)
      .select('role_id')
      .list();
    if (links.length === 0) return false;
    const roles = await db
      .query(RoleModel)
      .where(
        'id',
        'IN',
        links.map((link) => link.role_id),
      )
      .where('status', '=', 1)
      .select('code')
      .list();
    return roles.some((role) => role.code === 'admin');
  }

  async function resolveUnchecked(user: AuthUser): Promise<ResolvedDataScope> {
    const principal = await db.query(UserModel).where('id', '=', user.id).select('dept_id').get();
    if (!principal) return { all: false, departmentIds: [], self: false, userId: user.id };
    const links = await db
      .query(UserRoleModel)
      .where('user_id', '=', user.id)
      .select('role_id')
      .list();
    const roleIds = links.map((link) => link.role_id);
    if (roleIds.length === 0)
      return { all: false, departmentIds: [], self: false, userId: user.id };
    const roleRows = await db
      .query(RoleModel)
      .where('id', 'IN', roleIds)
      .where('status', '=', 1)
      .select('id', 'code', 'data_scope')
      .list();
    if (roleRows.some((role) => role.code === 'admin')) {
      return { all: true, departmentIds: [], self: true, userId: user.id };
    }
    const customRoleIds = roleRows
      .filter((role) => role.data_scope === DataScope.CUSTOM_DEPARTMENTS)
      .map((role) => role.id);
    const custom = new Map<string, string[]>();
    if (customRoleIds.length > 0) {
      const rows = await db
        .query(RoleDeptModel)
        .where('role_id', 'IN', customRoleIds)
        .select('role_id', 'dept_id')
        .list();
      for (const row of rows)
        custom.set(row.role_id, [...(custom.get(row.role_id) ?? []), row.dept_id]);
    }
    const descendants = new Map<string, string[]>();
    if (
      roleRows.some((role) => role.data_scope === DataScope.DEPARTMENT_AND_DESCENDANTS) &&
      principal.dept_id
    ) {
      const departments = await db
        .query(DeptModel)
        .where('status', '=', 1)
        .select('id', 'parent_id')
        .list();
      const children = new Map<string, string[]>();
      for (const dept of departments)
        if (dept.parent_id)
          children.set(dept.parent_id, [...(children.get(dept.parent_id) ?? []), dept.id]);
      const collected: string[] = [];
      const pending = [...(children.get(principal.dept_id) ?? [])];
      while (pending.length > 0) {
        const id = pending.shift()!;
        collected.push(id);
        pending.push(...(children.get(id) ?? []));
      }
      descendants.set(principal.dept_id, collected);
    }
    return mergeDataScopes(
      user.id,
      principal.dept_id ?? null,
      roleRows.map((role) => ({ id: role.id, dataScope: role.data_scope })),
      custom,
      descendants,
    );
  }

  async function resolve(user: AuthUser): Promise<ResolvedDataScope> {
    try {
      return await resolveUnchecked(user);
    } catch (error) {
      if (error instanceof DataScopeResolutionError) throw error;
      throw new DataScopeResolutionError(error);
    }
  }

  return {
    resolve,
    async canAccessUser(user, targetUserId) {
      try {
        const scope = await resolve(user);
        if (scope.all || (scope.self && scope.userId === targetUserId)) return true;
        const target = await db
          .query(UserModel)
          .where('id', '=', targetUserId)
          .select('dept_id')
          .get();
        return !!target?.dept_id && scope.departmentIds.includes(target.dept_id);
      } catch (error) {
        if (error instanceof DataScopeResolutionError) throw error;
        throw new DataScopeResolutionError(error);
      }
    },
    async canMutateUser(user, targetUserId) {
      try {
        if (!(await this.canAccessUser(user, targetUserId))) return false;
        if (await hasActiveAdminRole(user.id)) return true;
        const targetLinks = await db
          .query(UserRoleModel)
          .where('user_id', '=', targetUserId)
          .select('role_id')
          .list();
        if (targetLinks.length === 0) return true;
        const targetRoles = await db
          .query(RoleModel)
          .where(
            'id',
            'IN',
            targetLinks.map((link) => link.role_id),
          )
          .where('status', '=', 1)
          .select('code')
          .list();
        return !targetRoles.some((role) => role.code === 'admin');
      } catch (error) {
        if (error instanceof DataScopeResolutionError) throw error;
        throw new DataScopeResolutionError(error);
      }
    },
    async canAssignDepartment(user, departmentId) {
      const scope = await resolve(user);
      return scope.all || (!!departmentId && scope.departmentIds.includes(departmentId));
    },
  };
}

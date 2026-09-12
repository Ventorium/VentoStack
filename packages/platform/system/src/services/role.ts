/**
 * @ventostack/system - RoleService
 * 角色管理服务：创建、更新、删除、查询、菜单分配、数据范围分配
 */

import type { Cache } from '@ventostack/cache';
import type { Database } from '@ventostack/database';
import { DeptModel } from '../models/dept';
import { RoleMenuModel } from '../models/menu';
import { RoleDeptModel, RoleModel, UserRoleModel } from '../models/role';
import { createCacheKeyNamespace } from './cache-key';
import type { CacheKeyNamespace } from './cache-key';
import type { PaginatedResult } from './user';

/** 创建角色参数 */
export interface CreateRoleParams {
  name: string;
  code: string;
  sort?: number;
  dataScope?: number;
  /** 状态 0=停用 1=启用 */
  status?: number;
  remark?: string;
}

/** 角色详情 */
export interface RoleDetail {
  id: string;
  name: string;
  code: string;
  sort: number;
  dataScope: number | null;
  status: number;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 角色列表项 */
export interface RoleListItem {
  id: string;
  name: string;
  code: string;
  sort: number;
  dataScope: number | null;
  status: number;
  createdAt: string;
}

/** 角色服务接口 */
export interface RoleService {
  create(params: CreateRoleParams): Promise<{ id: string }>;
  update(id: string, params: Partial<CreateRoleParams>): Promise<void>;
  delete(id: string): Promise<void>;
  getById(id: string): Promise<RoleDetail | null>;
  list(params?: {
    page?: number;
    pageSize?: number;
    status?: number;
  }): Promise<PaginatedResult<RoleListItem>>;
  assignMenus(roleId: string, menuIds: string[]): Promise<void>;
  getRoleMenuIds(roleId: string): Promise<string[]>;
  assignDataScope(
    roleId: string,
    scope: number,
    deptIds: string[] | undefined,
    grant: DataScopeGrant,
  ): Promise<void>;
  getDataScope(roleId: string): Promise<{ scope: number; deptIds: string[] } | null>;
}

export interface DataScopeGrant {
  all: boolean;
  departmentIds: string[];
}

export const DataScope = {
  ALL: 1,
  DEPARTMENT: 2,
  DEPARTMENT_AND_DESCENDANTS: 3,
  SELF: 4,
  CUSTOM_DEPARTMENTS: 5,
} as const;

const DATA_SCOPE_VALUES = new Set<number>(Object.values(DataScope));

/**
 * 创建角色服务实例
 * @param deps 依赖项
 * @returns 角色服务实例
 */
export function createRoleService(deps: {
  db: Database;
  cache: Cache;
  /** 租户 ID，启用多租户时传入以隔离缓存 */
  tenantId?: string;
}): RoleService {
  const { db, cache } = deps;
  const ns: CacheKeyNamespace = createCacheKeyNamespace(deps.tenantId);

  return {
    async create(params) {
      const { name, code, sort, dataScope, remark, status } = params;
      const id = crypto.randomUUID();

      await db.query(RoleModel).insert({
        id,
        name,
        code,
        sort: sort ?? 0,
        data_scope: dataScope ?? DataScope.SELF,
        status: status ?? 1,
        remark: remark ?? null,
      });

      await cache.del(ns.listKey('role'));

      return { id };
    },

    async update(id, params) {
      const updates: Record<string, unknown> = {};
      if (params.name !== undefined) updates.name = params.name;
      if (params.code !== undefined) updates.code = params.code;
      if (params.sort !== undefined) updates.sort = params.sort;
      if (params.dataScope !== undefined) updates.data_scope = params.dataScope;
      if (params.remark !== undefined) updates.remark = params.remark;
      if (params.status !== undefined) updates.status = params.status;

      if (Object.keys(updates).length === 0) return;

      await db.query(RoleModel).where('id', '=', id).update(updates);

      await cache.del(ns.detailKey('role', id));
      await cache.del(ns.listKey('role'));
    },

    async delete(id) {
      await db.transaction(async (tx) => {
        await tx.query(RoleMenuModel).where('role_id', '=', id).hardDelete();
        await tx.query(UserRoleModel).where('role_id', '=', id).hardDelete();
        await tx.query(RoleDeptModel).where('role_id', '=', id).hardDelete();
        await tx.query(RoleModel).where('id', '=', id).delete();
      });

      await cache.del(ns.detailKey('role', id));
      await cache.del(ns.listKey('role'));
    },

    async getById(id) {
      const cached = await cache.get<RoleDetail>(ns.detailKey('role', id));
      if (cached) return cached;

      const row = await db
        .query(RoleModel)
        .where('id', '=', id)
        .select(
          'id',
          'name',
          'code',
          'sort',
          'data_scope',
          'status',
          'remark',
          'created_at',
          'updated_at',
        )
        .get();

      if (!row) return null;

      const detail: RoleDetail = {
        id: row.id,
        name: row.name,
        code: row.code,
        sort: row.sort,
        dataScope: row.data_scope ?? null,
        status: row.status,
        remark: row.remark ?? null,
        createdAt:
          row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        updatedAt:
          row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
      };

      await cache.set(ns.detailKey('role', id), detail, { ttl: 300 });

      return detail;
    },

    async list(params) {
      const { page = 1, pageSize = 10, status } = params ?? {};

      let query = db.query(RoleModel);
      if (status !== undefined) {
        query = query.where('status', '=', status);
      }

      const total = await query.count();

      const rows = await query
        .select('id', 'name', 'code', 'sort', 'data_scope', 'status', 'created_at')
        .orderBy('sort', 'desc')
        .orderBy('created_at', 'desc')
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .list();

      const list = rows.map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        sort: row.sort,
        dataScope: row.data_scope ?? null,
        status: row.status,
        createdAt:
          row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      }));

      return {
        items: list,
        total,
        page,
        pageSize,
        totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
      };
    },

    async assignMenus(roleId, menuIds) {
      // 先删除旧的关联
      await db.query(RoleMenuModel).where('role_id', '=', roleId).hardDelete();

      // 批量插入新关联
      if (menuIds.length > 0) {
        await db
          .query(RoleMenuModel)
          .batchInsert(menuIds.map((menuId) => ({ role_id: roleId, menu_id: menuId })));
      }

      // 清除与角色相关的缓存
      await cache.del(ns.key(`role:menus:${roleId}`));
      await cache.del(ns.listKey('role'));
    },

    async getRoleMenuIds(roleId) {
      const cached = await cache.get<string>(ns.key(`role:menus:${roleId}`));
      if (cached) return JSON.parse(cached) as string[];
      const rows = await db
        .query(RoleMenuModel)
        .where('role_id', '=', roleId)
        .select('menu_id')
        .list();
      const ids = rows.map((r) => r.menu_id as string);
      await cache.set(ns.key(`role:menus:${roleId}`), JSON.stringify(ids), { ttl: 3600 });
      return ids;
    },

    async assignDataScope(roleId, scope, deptIds, grant) {
      if (!Number.isInteger(scope) || !DATA_SCOPE_VALUES.has(scope)) {
        throw new Error('无效的数据权限范围');
      }
      if (
        deptIds &&
        (!Array.isArray(deptIds) ||
          deptIds.some((id) => typeof id !== 'string' || id.length === 0 || id.length > 36))
      ) {
        throw new Error('部门 ID 列表格式错误');
      }
      const normalizedDeptIds = [...new Set(deptIds ?? [])];
      if (scope === DataScope.CUSTOM_DEPARTMENTS && normalizedDeptIds.length === 0) {
        throw new Error('自定义数据权限至少选择一个部门');
      }
      if (scope !== DataScope.CUSTOM_DEPARTMENTS && normalizedDeptIds.length > 0) {
        throw new Error('仅自定义数据权限可选择部门');
      }
      if (normalizedDeptIds.length > 500) throw new Error('自定义部门数量不能超过 500');
      if (!grant.all && scope === DataScope.ALL) {
        throw new Error('不能授予超出自身范围的数据权限');
      }
      if (
        !grant.all &&
        scope === DataScope.CUSTOM_DEPARTMENTS &&
        normalizedDeptIds.some((deptId) => !grant.departmentIds.includes(deptId))
      ) {
        throw new Error('不能选择自身数据权限范围外的部门');
      }

      if (normalizedDeptIds.length > 0) {
        const validDepartments = await db
          .query(DeptModel)
          .where('id', 'IN', normalizedDeptIds)
          .where('status', '=', 1)
          .select('id')
          .list();
        if (validDepartments.length !== normalizedDeptIds.length) {
          throw new Error('包含不存在或已停用的部门');
        }
      }

      await db.transaction(async (tx) => {
        await tx.query(RoleModel).where('id', '=', roleId).update({ data_scope: scope });
        await tx.query(RoleDeptModel).where('role_id', '=', roleId).hardDelete();
        if (normalizedDeptIds.length > 0) {
          await tx
            .query(RoleDeptModel)
            .batchInsert(normalizedDeptIds.map((deptId) => ({ role_id: roleId, dept_id: deptId })));
        }
      });

      await cache.del(ns.detailKey('role', roleId));
    },

    async getDataScope(roleId) {
      const role = await db.query(RoleModel).where('id', '=', roleId).select('data_scope').get();
      if (!role) return null;
      const rows = await db
        .query(RoleDeptModel)
        .where('role_id', '=', roleId)
        .select('dept_id')
        .list();
      return { scope: role.data_scope ?? DataScope.SELF, deptIds: rows.map((row) => row.dept_id) };
    },
  };
}

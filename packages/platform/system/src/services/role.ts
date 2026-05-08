/**
 * @ventostack/system - RoleService
 * 角色管理服务：创建、更新、删除、查询、菜单分配、数据范围分配
 */

import type { Cache } from "@ventostack/cache";
import type { Database } from "@ventostack/database";
import type { PaginatedResult } from "./user";
import { RoleModel } from "../models/role";
import { RoleMenuModel } from "../models/menu";

/** 创建角色参数 */
export interface CreateRoleParams {
  name: string;
  code: string;
  sort?: number;
  dataScope?: number;
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
  assignDataScope(
    roleId: string,
    scope: number,
    deptIds?: string[],
  ): Promise<void>;
}

/**
 * 创建角色服务实例
 * @param deps 依赖项
 * @returns 角色服务实例
 */
export function createRoleService(deps: {
  db: Database;
  cache: Cache;
}): RoleService {
  const { db, cache } = deps;

  return {
    async create(params) {
      const { name, code, sort, dataScope, remark } = params;
      const id = crypto.randomUUID();

      await db.query(RoleModel).insert({
        id,
        name,
        code,
        sort: sort ?? 0,
        data_scope: dataScope ?? null,
        status: 1,
        remark: remark ?? null,
      });

      await cache.del("role:list");

      return { id };
    },

    async update(id, params) {
      const updates: Record<string, unknown> = {};
      if (params.name !== undefined) updates.name = params.name;
      if (params.code !== undefined) updates.code = params.code;
      if (params.sort !== undefined) updates.sort = params.sort;
      if (params.dataScope !== undefined) updates.data_scope = params.dataScope;
      if (params.remark !== undefined) updates.remark = params.remark;

      if (Object.keys(updates).length === 0) return;

      await db.query(RoleModel).where("id", "=", id).update(updates);

      await cache.del(`role:detail:${id}`);
      await cache.del("role:list");
    },

    async delete(id) {
      // 先删除角色-菜单关联
      await db.query(RoleMenuModel).where("role_id", "=", id).hardDelete();
      // 先删除用户-角色关联
      await db.raw("DELETE FROM sys_user_role WHERE role_id = $1", [id]);
      // 软删除角色
      await db.query(RoleModel).where("id", "=", id).delete();

      await cache.del(`role:detail:${id}`);
      await cache.del("role:list");
    },

    async getById(id) {
      const cached = await cache.get<RoleDetail>(`role:detail:${id}`);
      if (cached) return cached;

      const row = await db.query(RoleModel)
        .where("id", "=", id)
        .select("id", "name", "code", "sort", "data_scope", "status", "remark", "created_at", "updated_at")
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
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
      };

      await cache.set(`role:detail:${id}`, detail, { ttl: 300 });

      return detail;
    },

    async list(params) {
      const { page = 1, pageSize = 10, status } = params ?? {};

      let query = db.query(RoleModel);
      if (status !== undefined) {
        query = query.where("status", "=", status);
      }

      const total = await query.count();

      const rows = await query
        .select("id", "name", "code", "sort", "data_scope", "status", "created_at")
        .orderBy("sort", "asc")
        .orderBy("created_at", "desc")
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
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      }));

      return { items: list, total, page, pageSize, totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0 };
    },

    async assignMenus(roleId, menuIds) {
      // 先删除旧的关联
      await db.query(RoleMenuModel).where("role_id", "=", roleId).hardDelete();

      // 批量插入新关联
      if (menuIds.length > 0) {
        await db.query(RoleMenuModel).batchInsert(
          menuIds.map(menuId => ({ role_id: roleId, menu_id: menuId })),
        );
      }

      // 清除与角色相关的缓存
      await cache.del(`role:menus:${roleId}`);
      await cache.del("role:list");
    },

    async assignDataScope(roleId, scope, deptIds) {
      await db.query(RoleModel).where("id", "=", roleId).update({ data_scope: scope });

      // 如果提供了部门 ID，更新角色-部门关联表
      if (deptIds) {
        await db.raw("DELETE FROM sys_role_dept WHERE role_id = $1", [roleId]);

        if (deptIds.length > 0) {
          await db.raw(
            `INSERT INTO sys_role_dept (role_id, dept_id) VALUES ${deptIds.map((_, i) => `($1, $${i + 2})`).join(", ")}`,
            [roleId, ...deptIds],
          );
        }
      }

      await cache.del(`role:detail:${roleId}`);
    },
  };
}

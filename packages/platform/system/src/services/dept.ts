/**
 * @ventostack/system - 部门服务
 * 提供部门的 CRUD 与树形结构查询
 */

import type { Database } from '@ventostack/database';
import { DeptModel } from '../models/dept';
import { RoleDeptModel } from '../models/role';
import { UserModel } from '../models/user';

/** 部门创建参数 */
export interface CreateDeptParams {
  parentId?: string;
  name: string;
  sort?: number;
  /** 负责人用户 ID */
  leaderUserId?: string;
  status?: number;
}

/** 部门更新参数 */
export interface UpdateDeptParams {
  parentId?: string | null;
  name?: string;
  sort?: number;
  /** 负责人用户 ID，传 null 表示清除负责人 */
  leaderUserId?: string | null;
  status?: number;
}

/** 部门树节点 */
export interface DeptTreeNode {
  id: string;
  parentId: string | null;
  name: string;
  sort: number;
  leaderUserId: string | null;
  leaderName: string;
  status: number;
  remark: string;
  createdAt: string;
  children: DeptTreeNode[];
}

/** 部门服务接口 */
export interface DeptService {
  /** 创建部门 */
  create(params: CreateDeptParams): Promise<{ id: string }>;
  /** 更新部门 */
  update(id: string, params: UpdateDeptParams): Promise<void>;
  /** 删除部门（软删除） */
  delete(id: string): Promise<void>;
  /** 获取部门树 */
  getTree(): Promise<DeptTreeNode[]>;
}

/**
 * 创建部门服务实例
 * @param deps 依赖注入
 * @returns DeptService 实例
 */
export function createDeptService(deps: { db: Database }): DeptService {
  const { db } = deps;

  /** 校验负责人用户 ID 有效（存在且未删除且启用） */
  async function assertLeaderValid(userId: string): Promise<void> {
    const user = await db.query(UserModel).where('id', '=', userId).select('status').get();
    if (!user || user.status !== 1) {
      throw new Error('负责人用户不存在或已停用');
    }
  }

  async function create(params: CreateDeptParams): Promise<{ id: string }> {
    if (params.leaderUserId) await assertLeaderValid(params.leaderUserId);
    if (params.parentId) {
      const parent = await db
        .query(DeptModel)
        .where('id', '=', params.parentId)
        .select('status')
        .get();
      if (!parent || parent.status !== 1) throw new Error('父部门不存在或已停用');
    }
    const id = crypto.randomUUID();
    await db.query(DeptModel).insert({
      id,
      parent_id: params.parentId ?? null,
      name: params.name,
      sort: params.sort ?? 0,
      leader_user_id: params.leaderUserId ?? null,
      status: params.status ?? 1,
    });
    return { id };
  }

  async function update(id: string, params: UpdateDeptParams): Promise<void> {
    if (Object.keys(params).length === 0) return;
    if (params.leaderUserId) await assertLeaderValid(params.leaderUserId);
    const current = await db.query(DeptModel).where('id', '=', id).select('id').get();
    if (!current) throw new Error('部门不存在');
    if (params.parentId === id) throw new Error('部门不能设置自己为父部门');
    if (params.parentId) {
      const rows = await db.query(DeptModel).select('id', 'parent_id', 'status').list();
      const byId = new Map(rows.map((row) => [row.id, row]));
      const parent = byId.get(params.parentId);
      if (!parent || parent.status !== 1) throw new Error('父部门不存在或已停用');
      const visited = new Set<string>();
      let cursor: string | null = params.parentId;
      while (cursor) {
        if (cursor === id) throw new Error('不能将部门移动到自己的子部门下');
        if (visited.has(cursor)) throw new Error('部门层级存在循环引用');
        visited.add(cursor);
        cursor = byId.get(cursor)?.parent_id ?? null;
      }
    }
    const updates: Record<string, unknown> = {};
    if (params.parentId !== undefined) updates.parent_id = params.parentId;
    if (params.name !== undefined) updates.name = params.name;
    if (params.sort !== undefined) updates.sort = params.sort;
    if (params.leaderUserId !== undefined) updates.leader_user_id = params.leaderUserId;
    if (params.status !== undefined) updates.status = params.status;

    await db.query(DeptModel).where('id', '=', id).update(updates);
  }

  async function deleteDept(id: string): Promise<void> {
    const children = await db.query(DeptModel).where('parent_id', '=', id).count();
    if (children > 0) throw new Error('部门存在子部门，不能删除');
    const users = await db.query(UserModel).where('dept_id', '=', id).count();
    if (users > 0) throw new Error('部门存在用户，不能删除');
    const roleScopes = await db.query(RoleDeptModel).where('dept_id', '=', id).count();
    if (roleScopes > 0) throw new Error('部门正在被角色数据权限使用，不能删除');
    await db.query(DeptModel).where('id', '=', id).delete();
  }

  async function getTree(): Promise<DeptTreeNode[]> {
    const rows = await db
      .query(DeptModel)
      .select('id', 'parent_id', 'name', 'sort', 'leader_user_id', 'status', 'remark', 'created_at')
      .orderBy('sort', 'asc')
      .orderBy('id', 'asc')
      .list();

    // 批量解析负责人昵称
    const leaderIds = [
      ...new Set(rows.map((r) => r.leader_user_id).filter((v): v is string => !!v)),
    ];
    const leaderNames = new Map<string, string>();
    if (leaderIds.length > 0) {
      const userRows = await db
        .query(UserModel)
        .where('id', 'IN', leaderIds)
        .select('id', 'nickname', 'username')
        .list();
      for (const u of userRows) {
        leaderNames.set(u.id, u.nickname || u.username);
      }
    }

    const nodes: DeptTreeNode[] = rows.map((row) => ({
      id: row.id,
      parentId: row.parent_id ?? null,
      name: row.name,
      sort: row.sort ?? 0,
      leaderUserId: row.leader_user_id ?? null,
      leaderName: (row.leader_user_id && leaderNames.get(row.leader_user_id)) || '',
      status: row.status ?? 1,
      remark: row.remark ?? '',
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at ?? ''),
      children: [],
    }));

    const nodeMap = new Map<string, DeptTreeNode>();
    for (const node of nodes) {
      nodeMap.set(node.id, node);
    }

    for (const node of nodes) {
      const visited = new Set<string>();
      let cursor: DeptTreeNode | undefined = node;
      while (cursor?.parentId) {
        if (visited.has(cursor.id)) throw new Error('部门层级存在循环引用');
        visited.add(cursor.id);
        cursor = nodeMap.get(cursor.parentId);
      }
    }

    const roots: DeptTreeNode[] = [];
    for (const node of nodes) {
      if (!node.parentId) {
        roots.push(node);
      } else {
        const parent = nodeMap.get(node.parentId);
        if (parent) {
          parent.children.push(node);
        } else {
          roots.push(node);
        }
      }
    }

    return roots;
  }

  return { create, update, delete: deleteDept, getTree };
}

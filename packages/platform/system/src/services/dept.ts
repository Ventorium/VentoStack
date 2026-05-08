/**
 * @ventostack/system - 部门服务
 * 提供部门的 CRUD 与树形结构查询
 */

import type { Database } from "@ventostack/database";
import { DeptModel } from "../models/dept";

/** 部门创建参数 */
export interface CreateDeptParams {
  parentId?: string;
  name: string;
  sort?: number;
  leader?: string;
  phone?: string;
  email?: string;
}

/** 部门更新参数 */
export interface UpdateDeptParams {
  parentId?: string;
  name?: string;
  sort?: number;
  leader?: string;
  phone?: string;
  email?: string;
  status?: number;
}

/** 部门树节点 */
export interface DeptTreeNode {
  id: string;
  parentId: string | null;
  name: string;
  sort: number;
  leader: string;
  phone: string;
  email: string;
  status: number;
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

  async function create(params: CreateDeptParams): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    await db.query(DeptModel).insert({
      id,
      parent_id: params.parentId ?? null,
      name: params.name,
      sort: params.sort ?? 0,
      leader: params.leader ?? null,
      phone: params.phone ?? null,
      email: params.email ?? null,
      status: 1,
    });
    return { id };
  }

  async function update(id: string, params: UpdateDeptParams): Promise<void> {
    const updates: Record<string, unknown> = {};
    if (params.parentId !== undefined) updates.parent_id = params.parentId;
    if (params.name !== undefined) updates.name = params.name;
    if (params.sort !== undefined) updates.sort = params.sort;
    if (params.leader !== undefined) updates.leader = params.leader;
    if (params.phone !== undefined) updates.phone = params.phone;
    if (params.email !== undefined) updates.email = params.email;
    if (params.status !== undefined) updates.status = params.status;

    if (Object.keys(updates).length === 0) return;

    await db.query(DeptModel).where("id", "=", id).update(updates);
  }

  async function deleteDept(id: string): Promise<void> {
    await db.query(DeptModel).where("id", "=", id).delete();
  }

  async function getTree(): Promise<DeptTreeNode[]> {
    const rows = await db.query(DeptModel)
      .select("id", "parent_id", "name", "sort", "leader", "phone", "email", "status", "created_at")
      .orderBy("sort", "asc")
      .orderBy("id", "asc")
      .list();

    const nodes: DeptTreeNode[] = rows.map((row) => ({
      id: row.id,
      parentId: row.parent_id ?? null,
      name: row.name,
      sort: row.sort ?? 0,
      leader: row.leader ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      status: row.status ?? 1,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? ""),
      children: [],
    }));

    const nodeMap = new Map<string, DeptTreeNode>();
    for (const node of nodes) {
      nodeMap.set(node.id, node);
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

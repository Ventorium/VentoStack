/**
 * @ventostack/system - 部门服务
 * 提供部门的 CRUD 与树形结构查询
 */

import type { SqlExecutor } from "@ventostack/database";

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
export function createDeptService(deps: { executor: SqlExecutor }): DeptService {
  const { executor } = deps;

  async function create(params: CreateDeptParams): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    await executor(
      `INSERT INTO sys_dept (id, parent_id, name, sort, leader, phone, email, status, deleted_at) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, NULL)`,
      [
        id,
        params.parentId ?? null,
        params.name,
        params.sort ?? 0,
        params.leader ?? null,
        params.phone ?? null,
        params.email ?? null,
      ],
    );
    return { id };
  }

  async function update(id: string, params: UpdateDeptParams): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params.parentId !== undefined) {
      sets.push(`parent_id = $${idx++}`);
      values.push(params.parentId);
    }
    if (params.name !== undefined) {
      sets.push(`name = $${idx++}`);
      values.push(params.name);
    }
    if (params.sort !== undefined) {
      sets.push(`sort = $${idx++}`);
      values.push(params.sort);
    }
    if (params.leader !== undefined) {
      sets.push(`leader = $${idx++}`);
      values.push(params.leader);
    }
    if (params.phone !== undefined) {
      sets.push(`phone = $${idx++}`);
      values.push(params.phone);
    }
    if (params.email !== undefined) {
      sets.push(`email = $${idx++}`);
      values.push(params.email);
    }
    if (params.status !== undefined) {
      sets.push(`status = $${idx++}`);
      values.push(params.status);
    }

    if (sets.length === 0) return;

    values.push(id);
    await executor(
      `UPDATE sys_dept SET ${sets.join(", ")} WHERE id = $${idx} AND deleted_at IS NULL`,
      values,
    );
  }

  async function deleteDept(id: string): Promise<void> {
    const now = new Date().toISOString();
    await executor(
      `UPDATE sys_dept SET deleted_at = $1 WHERE id = $2 AND deleted_at IS NULL`,
      [now, id],
    );
  }

  async function getTree(): Promise<DeptTreeNode[]> {
    const rows = await executor(
      `SELECT id, parent_id, name, sort, leader, phone, email, status, created_at FROM sys_dept WHERE deleted_at IS NULL ORDER BY sort ASC, id ASC`,
    ) as Array<Record<string, unknown>>;

    const nodes: DeptTreeNode[] = rows.map((row) => ({
      id: row.id as string,
      parentId: (row.parent_id as string) ?? null,
      name: row.name as string,
      sort: (row.sort as number) ?? 0,
      leader: (row.leader as string) ?? "",
      phone: (row.phone as string) ?? "",
      email: (row.email as string) ?? "",
      status: (row.status as number) ?? 1,
      createdAt: (row.created_at as string) ?? "",
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

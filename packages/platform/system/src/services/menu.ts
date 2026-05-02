/**
 * @ventostack/system - MenuService
 * 菜单管理服务：创建、更新、删除、树形结构构建
 * 菜单类型：1=目录 2=菜单 3=按钮
 */

import type { SqlExecutor } from "@ventostack/database";

/** 创建菜单参数 */
export interface CreateMenuParams {
  parentId: string | null;
  name: string;
  path: string;
  component: string;
  redirect: string;
  type: number;
  permission: string;
  icon: string;
  sort: number;
  visible: boolean;
  status?: number;
}

/** 菜单树节点 */
export interface MenuTreeNode {
  id: string;
  parentId: string | null;
  name: string;
  path: string;
  component: string;
  redirect: string;
  type: number;
  permission: string;
  icon: string;
  sort: number;
  visible: boolean;
  status: number;
  createdAt: string;
  children: MenuTreeNode[];
}

/** 菜单服务接口 */
export interface MenuService {
  create(params: CreateMenuParams): Promise<{ id: string }>;
  update(id: string, params: Partial<CreateMenuParams>): Promise<void>;
  delete(id: string): Promise<void>;
  getTree(): Promise<MenuTreeNode[]>;
  getAllTree(): Promise<MenuTreeNode[]>;
  getById(id: string): Promise<MenuTreeNode | null>;
}

/**
 * 将扁平的菜单行记录转换为树形结构
 * @param rows 扁平的菜单行
 * @returns 树形结构的根节点列表
 */
function buildTree(rows: Array<Record<string, unknown>>): MenuTreeNode[] {
  const nodeMap = new Map<string, MenuTreeNode>();
  const rootNodes: MenuTreeNode[] = [];

  // 先创建所有节点
  for (const row of rows) {
    const node: MenuTreeNode = {
      id: row.id as string,
      parentId: (row.parent_id as string) ?? null,
      name: row.name as string,
      path: (row.path as string) ?? "",
      component: (row.component as string) ?? "",
      redirect: (row.redirect as string) ?? "",
      type: row.type as number,
      permission: (row.permission as string) ?? "",
      icon: (row.icon as string) ?? "",
      sort: row.sort as number,
      visible: (row.visible as boolean) ?? true,
      status: (row.status as number) ?? 1,
      createdAt: (row.created_at as string) ?? "",
      children: [],
    };
    nodeMap.set(node.id, node);
  }

  // 建立父子关系
  for (const node of nodeMap.values()) {
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId)!.children.push(node);
    } else {
      rootNodes.push(node);
    }
  }

  // 按 sort 排序
  const sortBySort = (a: MenuTreeNode, b: MenuTreeNode): number => a.sort - b.sort;

  function sortTree(nodes: MenuTreeNode[]): MenuTreeNode[] {
    nodes.sort(sortBySort);
    for (const node of nodes) {
      if (node.children.length > 0) {
        sortTree(node.children);
      }
    }
    return nodes;
  }

  return sortTree(rootNodes);
}

/**
 * 在树中查找指定 ID 的节点
 * @param nodes 树节点列表
 * @param id 目标 ID
 * @returns 找到的节点或 null
 */
function findInTree(nodes: MenuTreeNode[], id: string): MenuTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children.length > 0) {
      const found = findInTree(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 创建菜单服务实例
 * @param deps 依赖项
 * @returns 菜单服务实例
 */
export function createMenuService(deps: {
  executor: SqlExecutor;
}): MenuService {
  const { executor } = deps;

  return {
    async create(params) {
      const {
        parentId,
        name,
        path,
        component,
        redirect,
        type,
        permission,
        icon,
        sort,
        visible,
        status,
      } = params;
      const id = crypto.randomUUID();

      await executor(
        `INSERT INTO sys_menu (id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())`,
        [
          id,
          parentId ?? null,
          name,
          path,
          component,
          redirect,
          type,
          permission,
          icon,
          sort,
          visible,
          status ?? 1,
        ],
      );

      return { id };
    },

    async update(id, params) {
      const fields: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      const updatableFields: Record<string, unknown> = {
        parent_id: params.parentId,
        name: params.name,
        path: params.path,
        component: params.component,
        redirect: params.redirect,
        type: params.type,
        permission: params.permission,
        icon: params.icon,
        sort: params.sort,
        visible: params.visible,
        status: params.status,
      };

      for (const [field, value] of Object.entries(updatableFields)) {
        if (value !== undefined) {
          fields.push(`${field} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      }

      if (fields.length === 0) return;

      fields.push("updated_at = NOW()");
      values.push(id);

      await executor(
        `UPDATE sys_menu SET ${fields.join(", ")} WHERE id = $${paramIndex}`,
        values,
      );
    },

    async delete(id) {
      // 先删除子菜单（递归删除子节点的子节点）
      await executor(
        "DELETE FROM sys_menu WHERE parent_id = $1",
        [id],
      );
      // 删除角色-菜单关联
      await executor(
        "DELETE FROM sys_role_menu WHERE menu_id = $1",
        [id],
      );
      // 删除菜单本身
      await executor(
        "DELETE FROM sys_menu WHERE id = $1",
        [id],
      );
    },

    async getTree() {
      const rows = await executor(
        `SELECT id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at
         FROM sys_menu WHERE status = 1
         ORDER BY sort ASC`,
      );

      return buildTree(rows as Array<Record<string, unknown>>);
    },

    async getAllTree() {
      const rows = await executor(
        `SELECT id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at
         FROM sys_menu
         ORDER BY sort ASC`,
      );

      return buildTree(rows as Array<Record<string, unknown>>);
    },

    async getById(id) {
      const rows = await executor(
        `SELECT id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at
         FROM sys_menu WHERE id = $1`,
        [id],
      );
      const menus = rows as Array<Record<string, unknown>>;

      if (menus.length === 0) return null;

      // 获取所有菜单来构建树（因为需要返回含 children 的节点）
      const allRows = await executor(
        `SELECT id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at
         FROM sys_menu WHERE status = 1
         ORDER BY sort ASC`,
      );
      const tree = buildTree(allRows as Array<Record<string, unknown>>);

      return findInTree(tree, id);
    },
  };
}

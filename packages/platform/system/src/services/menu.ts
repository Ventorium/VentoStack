/**
 * @ventostack/system - MenuService
 * 菜单管理服务：创建、更新、删除、树形结构构建
 * 菜单类型：1=目录 2=菜单 3=按钮
 */

import type { Database } from "@ventostack/database";
import { MenuModel, RoleMenuModel } from "../models/menu";

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
  db: Database;
}): MenuService {
  const { db } = deps;

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

      await db.query(MenuModel).insert({
        id,
        parent_id: parentId ?? null,
        name,
        path,
        component,
        redirect,
        type,
        permission,
        icon,
        sort,
        visible,
        status: status ?? 1,
      });

      return { id };
    },

    async update(id, params) {
      const updates: Record<string, unknown> = {};
      if (params.parentId !== undefined) updates.parent_id = params.parentId;
      if (params.name !== undefined) updates.name = params.name;
      if (params.path !== undefined) updates.path = params.path;
      if (params.component !== undefined) updates.component = params.component;
      if (params.redirect !== undefined) updates.redirect = params.redirect;
      if (params.type !== undefined) updates.type = params.type;
      if (params.permission !== undefined) updates.permission = params.permission;
      if (params.icon !== undefined) updates.icon = params.icon;
      if (params.sort !== undefined) updates.sort = params.sort;
      if (params.visible !== undefined) updates.visible = params.visible;
      if (params.status !== undefined) updates.status = params.status;

      if (Object.keys(updates).length === 0) return;

      await db.query(MenuModel).where("id", "=", id).update(updates);
    },

    async delete(id) {
      // 先删除子菜单
      await db.query(MenuModel).where("parent_id", "=", id).hardDelete();
      // 删除角色-菜单关联
      await db.query(RoleMenuModel).where("menu_id", "=", id).hardDelete();
      // 删除菜单本身
      await db.query(MenuModel).where("id", "=", id).hardDelete();
    },

    async getTree() {
      const rows = await db.query(MenuModel)
        .where("status", "=", 1)
        .orderBy("sort", "asc")
        .list();

      return buildTree(rows as unknown as Array<Record<string, unknown>>);
    },

    async getAllTree() {
      const rows = await db.query(MenuModel)
        .orderBy("sort", "asc")
        .list();

      return buildTree(rows as unknown as Array<Record<string, unknown>>);
    },

    async getById(id) {
      const row = await db.query(MenuModel)
        .where("id", "=", id)
        .get();

      if (!row) return null;

      // 获取所有菜单来构建树（因为需要返回含 children 的节点）
      const allRows = await db.query(MenuModel)
        .where("status", "=", 1)
        .orderBy("sort", "asc")
        .list();

      const tree = buildTree(allRows as unknown as Array<Record<string, unknown>>);

      return findInTree(tree, id);
    },
  };
}

/**
 * @ventostack/system - 标签服务
 * 提供人员标签的 CRUD 与用户绑定管理
 */

import type { Database } from "@ventostack/database";
import { TagModel, UserTagModel } from "../models/tag";

/** 标签创建参数 */
export interface CreateTagParams {
  name: string;
  code: string;
  sort?: number;
  remark?: string;
}

/** 标签更新参数 */
export interface UpdateTagParams {
  name?: string;
  code?: string;
  sort?: number;
  status?: number;
  remark?: string;
}

/** 标签列表项 */
export interface TagItem {
  id: string;
  name: string;
  code: string;
  sort: number;
  status: number;
  remark: string;
  createdAt: string;
}

/** 标签列表查询参数 */
export interface TagListParams {
  page?: number;
  pageSize?: number;
  status?: number;
}

/** 分页结果 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 标签服务接口 */
export interface TagService {
  /** 创建标签 */
  create(params: CreateTagParams): Promise<{ id: string }>;
  /** 更新标签 */
  update(id: string, params: UpdateTagParams): Promise<void>;
  /** 删除标签（软删除） */
  delete(id: string): Promise<void>;
  /** 分页查询标签列表 */
  list(params?: TagListParams): Promise<PaginatedResult<TagItem>>;
  /** 获取全部有效标签 */
  listAll(): Promise<TagItem[]>;
  /** 给用户绑定标签（全量覆盖） */
  assignUserTags(userId: string, tagIds: string[]): Promise<void>;
  /** 获取用户的标签 ID 列表 */
  getUserTagIds(userId: string): Promise<string[]>;
  /** 获取用户的标签列表 */
  getUserTags(userId: string): Promise<TagItem[]>;
  /** 根据标签 ID 查找用户 ID 列表 */
  getUserIdsByTag(tagId: string): Promise<string[]>;
  /** 根据标签 code 查找用户 ID 列表 */
  getUserIdsByTagCode(tagCode: string): Promise<string[]>;
}

/**
 * 创建标签服务实例
 * @param deps 依赖注入
 * @returns TagService 实例
 */
export function createTagService(deps: { db: Database }): TagService {
  const { db } = deps;

  async function create(params: CreateTagParams): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    await db.query(TagModel).insert({
      id,
      name: params.name,
      code: params.code,
      sort: params.sort ?? 0,
      status: 1,
      remark: params.remark ?? null,
    });
    return { id };
  }

  async function update(id: string, params: UpdateTagParams): Promise<void> {
    const updates: Record<string, unknown> = {};
    if (params.name !== undefined) updates.name = params.name;
    if (params.code !== undefined) updates.code = params.code;
    if (params.sort !== undefined) updates.sort = params.sort;
    if (params.status !== undefined) updates.status = params.status;
    if (params.remark !== undefined) updates.remark = params.remark;

    if (Object.keys(updates).length === 0) return;

    await db.query(TagModel).where("id", "=", id).update(updates);
  }

  async function deleteTag(id: string): Promise<void> {
    await db.query(TagModel).where("id", "=", id).delete();
    // 同时清理关联关系
    await db.query(UserTagModel).where("tag_id", "=", id).delete();
  }

  async function list(params?: TagListParams): Promise<PaginatedResult<TagItem>> {
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 10;

    let query = db.query(TagModel);
    if (params?.status !== undefined) {
      query = query.where("status", "=", params.status);
    }

    const total = await query.count();

    const rows = await query
      .select("id", "name", "code", "sort", "status", "remark", "created_at")
      .orderBy("sort", "desc")
      .orderBy("created_at", "desc")
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .list();

    const items: TagItem[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      sort: row.sort ?? 0,
      status: row.status ?? 1,
      remark: row.remark ?? "",
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at ?? ""),
    }));

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
    };
  }

  async function listAll(): Promise<TagItem[]> {
    const rows = await db
      .query(TagModel)
      .where("status", "=", 1)
      .select("id", "name", "code", "sort", "status", "remark", "created_at")
      .orderBy("sort", "desc")
      .orderBy("created_at", "desc")
      .list();

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      sort: row.sort ?? 0,
      status: row.status ?? 1,
      remark: row.remark ?? "",
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at ?? ""),
    }));
  }

  async function assignUserTags(userId: string, tagIds: string[]): Promise<void> {
    // 先删除旧关系
    await db.query(UserTagModel).where("user_id", "=", userId).delete();
    // 批量插入新关系
    for (const tagId of tagIds) {
      await db.query(UserTagModel).insert({
        user_id: userId,
        tag_id: tagId,
      });
    }
  }

  async function getUserTagIds(userId: string): Promise<string[]> {
    const rows = await db
      .query(UserTagModel)
      .where("user_id", "=", userId)
      .select("tag_id")
      .list();
    return rows.map((r) => r.tag_id);
  }

  async function getUserTags(userId: string): Promise<TagItem[]> {
    const rows = await db.raw(
      `SELECT t.id, t.name, t.code, t.sort, t.status, t.remark, t.created_at
       FROM sys_tag t
       JOIN sys_user_tag ut ON ut.tag_id = t.id
       WHERE ut.user_id = $1 AND t.status = 1 AND t.deleted_at IS NULL
       ORDER BY t.sort DESC, t.created_at DESC`,
      [userId],
    );
    return rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      name: row.name as string,
      code: row.code as string,
      sort: (row.sort as number) ?? 0,
      status: (row.status as number) ?? 1,
      remark: (row.remark as string) ?? "",
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at ?? ""),
    }));
  }

  async function getUserIdsByTag(tagId: string): Promise<string[]> {
    const rows = await db
      .query(UserTagModel)
      .where("tag_id", "=", tagId)
      .select("user_id")
      .list();
    return rows.map((r) => r.user_id);
  }

  async function getUserIdsByTagCode(tagCode: string): Promise<string[]> {
    const rows = await db.raw(
      `SELECT ut.user_id FROM sys_user_tag ut
       JOIN sys_tag t ON t.id = ut.tag_id
       WHERE t.code = $1 AND t.status = 1 AND t.deleted_at IS NULL`,
      [tagCode],
    );
    return rows.map((r: { user_id: string }) => r.user_id);
  }

  return {
    create,
    update,
    delete: deleteTag,
    list,
    listAll,
    assignUserTags,
    getUserTagIds,
    getUserTags,
    getUserIdsByTag,
    getUserIdsByTagCode,
  };
}

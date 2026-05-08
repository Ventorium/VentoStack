/**
 * @ventostack/system - 岗位服务
 * 提供岗位的 CRUD 与分页查询
 */

import type { Database } from "@ventostack/database";
import { PostModel } from "../models/post";

/** 岗位创建参数 */
export interface CreatePostParams {
  name: string;
  code: string;
  sort?: number;
  remark?: string;
}

/** 岗位更新参数 */
export interface UpdatePostParams {
  name?: string;
  code?: string;
  sort?: number;
  status?: number;
  remark?: string;
}

/** 岗位列表项 */
export interface PostItem {
  id: string;
  name: string;
  code: string;
  sort: number;
  status: number;
  remark: string;
}

/** 分页查询结果 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 岗位列表查询参数 */
export interface PostListParams {
  page?: number;
  pageSize?: number;
  status?: number;
}

/** 岗位服务接口 */
export interface PostService {
  /** 创建岗位 */
  create(params: CreatePostParams): Promise<{ id: string }>;
  /** 更新岗位 */
  update(id: string, params: UpdatePostParams): Promise<void>;
  /** 删除岗位（软删除） */
  delete(id: string): Promise<void>;
  /** 分页查询岗位列表 */
  list(params?: PostListParams): Promise<PaginatedResult<PostItem>>;
}

/**
 * 创建岗位服务实例
 * @param deps 依赖注入
 * @returns PostService 实例
 */
export function createPostService(deps: { db: Database }): PostService {
  const { db } = deps;

  async function create(params: CreatePostParams): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    await db.query(PostModel).insert({
      id,
      name: params.name,
      code: params.code,
      sort: params.sort ?? 0,
      status: 1,
      remark: params.remark ?? null,
    });
    return { id };
  }

  async function update(id: string, params: UpdatePostParams): Promise<void> {
    const updates: Record<string, unknown> = {};
    if (params.name !== undefined) updates.name = params.name;
    if (params.code !== undefined) updates.code = params.code;
    if (params.sort !== undefined) updates.sort = params.sort;
    if (params.status !== undefined) updates.status = params.status;
    if (params.remark !== undefined) updates.remark = params.remark;

    if (Object.keys(updates).length === 0) return;

    await db.query(PostModel).where("id", "=", id).update(updates);
  }

  async function deletePost(id: string): Promise<void> {
    await db.query(PostModel).where("id", "=", id).delete();
  }

  async function list(params?: PostListParams): Promise<PaginatedResult<PostItem>> {
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 10;

    let query = db.query(PostModel);
    if (params?.status !== undefined) {
      query = query.where("status", "=", params.status);
    }

    const total = await query.count();

    const rows = await query
      .select("id", "name", "code", "sort", "status", "remark")
      .orderBy("sort", "asc")
      .orderBy("id", "asc")
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .list();

    const items: PostItem[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      sort: row.sort ?? 0,
      status: row.status ?? 1,
      remark: row.remark ?? "",
    }));

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
    };
  }

  return { create, update, delete: deletePost, list };
}

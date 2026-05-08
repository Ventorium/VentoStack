/**
 * @ventostack/system - 通知公告服务
 * 提供通知公告的 CRUD、发布/撤回、已读标记与未读计数
 */

import type { Database } from "@ventostack/database";
import { NoticeModel, UserNoticeModel } from "../models/notice";

/** 分页查询结果 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 通知创建参数 */
export interface CreateNoticeParams {
  title: string;
  content: string;
  type: number;
}

/** 通知更新参数 */
export interface UpdateNoticeParams {
  title?: string;
  content?: string;
  type?: number;
  status?: number;
}

/** 通知列表项 */
export interface NoticeItem {
  id: string;
  title: string;
  content: string;
  type: number;
  status: number;
  publisherId: string;
  publishAt: string | null;
}

/** 通知列表查询参数 */
export interface NoticeListParams {
  page?: number;
  pageSize?: number;
  type?: number;
  status?: number;
}

/** 通知服务接口 */
export interface NoticeService {
  /** 创建通知 */
  create(params: CreateNoticeParams): Promise<{ id: string }>;
  /** 更新通知 */
  update(id: string, params: UpdateNoticeParams): Promise<void>;
  /** 删除通知（软删除） */
  delete(id: string): Promise<void>;
  /** 分页查询通知列表 */
  list(params?: NoticeListParams): Promise<PaginatedResult<NoticeItem>>;
  /** 发布通知 */
  publish(id: string, publisherId: string): Promise<void>;
  /** 撤回通知 */
  revoke(id: string): Promise<void>;
  /** 标记通知已读 */
  markRead(userId: string, noticeId: string): Promise<void>;
  /** 获取用户未读通知数 */
  getUnreadCount(userId: string): Promise<number>;
}

/**
 * 创建通知公告服务实例
 * @param deps 依赖注入
 * @returns NoticeService 实例
 */
export function createNoticeService(deps: { db: Database }): NoticeService {
  const { db } = deps;

  async function create(params: CreateNoticeParams): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    await db.query(NoticeModel).insert({
      id,
      title: params.title,
      content: params.content,
      type: params.type,
      status: 0,
      publisher_id: null,
      publish_at: null,
    });
    return { id };
  }

  async function update(id: string, params: UpdateNoticeParams): Promise<void> {
    const updates: Record<string, unknown> = {};
    if (params.title !== undefined) updates.title = params.title;
    if (params.content !== undefined) updates.content = params.content;
    if (params.type !== undefined) updates.type = params.type;
    if (params.status !== undefined) updates.status = params.status;

    if (Object.keys(updates).length === 0) return;

    await db.query(NoticeModel).where("id", "=", id).update(updates);
  }

  async function deleteNotice(id: string): Promise<void> {
    await db.query(NoticeModel).where("id", "=", id).delete();
  }

  async function list(params?: NoticeListParams): Promise<PaginatedResult<NoticeItem>> {
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 10;

    let query = db.query(NoticeModel);
    if (params?.type !== undefined) {
      query = query.where("type", "=", params.type);
    }
    if (params?.status !== undefined) {
      query = query.where("status", "=", params.status);
    }

    const total = await query.count();

    const rows = await query
      .select("id", "title", "content", "type", "status", "publisher_id", "publish_at")
      .orderBy("id", "desc")
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .list();

    const items: NoticeItem[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      content: row.content,
      type: row.type ?? 1,
      status: row.status ?? 0,
      publisherId: row.publisher_id ?? "",
      publishAt: row.publish_at ? String(row.publish_at) : null,
    }));

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
    };
  }

  async function publish(id: string, publisherId: string): Promise<void> {
    await db.query(NoticeModel).where("id", "=", id).update({
      status: 1,
      publisher_id: publisherId,
      publish_at: new Date(),
    });
  }

  async function revoke(id: string): Promise<void> {
    await db.query(NoticeModel).where("id", "=", id).update({
      status: 2,
      publish_at: null,
    });
  }

  async function markRead(userId: string, noticeId: string): Promise<void> {
    // ON CONFLICT DO NOTHING — use db.raw for this pattern
    await db.raw(
      `INSERT INTO sys_user_notice (user_id, notice_id, read_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [userId, noticeId, new Date()],
    );
  }

  async function getUnreadCount(userId: string): Promise<number> {
    // NOT EXISTS subquery — use db.raw
    const rows = await db.raw(
      `SELECT COUNT(*) AS cnt FROM sys_notice n WHERE n.deleted_at IS NULL AND n.status = 1 AND NOT EXISTS (SELECT 1 FROM sys_user_notice un WHERE un.user_id = $1 AND un.notice_id = n.id)`,
      [userId],
    ) as Array<Record<string, unknown>>;
    return Number(rows[0]?.cnt ?? 0);
  }

  return {
    create,
    update,
    delete: deleteNotice,
    list,
    publish,
    revoke,
    markRead,
    getUnreadCount,
  };
}

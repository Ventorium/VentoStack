/**
 * @ventostack/system - 通知公告服务
 * 提供通知公告的 CRUD、发布/撤回、已读标记与未读计数
 */

import { NotFoundError, VentoStackError } from '@ventostack/core';
import type { Database } from '@ventostack/database';
import { NoticeModel } from '../models/notice';

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
  sort: number;
  status: number;
  publisherId: string;
  publishAt: string | null;
  remark: string;
  createdAt: string;
}

/** 用户视角通知列表项（含已读状态） */
export interface UserNoticeItem extends NoticeItem {
  isRead: boolean;
}

/** 通知列表查询参数 */
export interface NoticeListParams {
  page?: number;
  pageSize?: number;
  title?: string;
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
  /** 审批完成事件触发的幂等发布 */
  publishApproved(id: string, publisherId: string): Promise<void>;
  /** 撤回通知 */
  revoke(id: string): Promise<void>;
  /** 标记通知已读 */
  markRead(userId: string, noticeId: string): Promise<void>;
  /** 批量标记已读 */
  markBatchRead(userId: string, noticeIds: string[]): Promise<void>;
  /** 获取用户未读通知数 */
  getUnreadCount(userId: string): Promise<number>;
  /** 查询已发布通知（附带当前用户已读状态） */
  listPublishedForUser(
    userId: string,
    params?: { page?: number; pageSize?: number },
  ): Promise<PaginatedResult<UserNoticeItem>>;
}

/**
 * 创建通知公告服务实例
 * @param deps 依赖注入
 * @returns NoticeService 实例
 */
export function createNoticeService(deps: { db: Database; tenantId: string }): NoticeService {
  const { db } = deps;

  function assertNoticeType(type: number): void {
    if (type !== 1 && type !== 2) {
      throw new VentoStackError('通知类型仅允许 1（通知）或 2（公告）', 400, 'INVALID_NOTICE_TYPE');
    }
  }

  /** 条件更新 0 行后区分 404（不存在/跨租户）与 409（状态冲突） */
  async function assertNoticeState(
    id: string,
    conflict: (status: number) => string,
  ): Promise<never> {
    const row = await db
      .query(NoticeModel)
      .where('tenant_id', '=', deps.tenantId)
      .where('id', '=', id)
      .select('status')
      .get();
    if (!row) throw new NotFoundError('通知不存在');
    throw new VentoStackError(conflict(row.status ?? 0), 409, 'NOTICE_STATE_CONFLICT');
  }

  async function create(params: CreateNoticeParams): Promise<{ id: string }> {
    assertNoticeType(params.type);
    const id = crypto.randomUUID();
    await db.query(NoticeModel).insert({
      id,
      tenant_id: deps.tenantId,
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
    if (params.type !== undefined) assertNoticeType(params.type);
    const updates: Record<string, unknown> = {};
    if (params.title !== undefined) updates.title = params.title;
    if (params.content !== undefined) updates.content = params.content;
    if (params.type !== undefined) updates.type = params.type;

    if (Object.keys(updates).length === 0) return;
    const updated = await db
      .query(NoticeModel)
      .where('tenant_id', '=', deps.tenantId)
      .where('id', '=', id)
      .where('status', '=', 0)
      .update(updates, { returning: true });
    if (!updated) await assertNoticeState(id, () => '仅草稿状态的通知可编辑');
  }

  async function deleteNotice(id: string): Promise<void> {
    const current = await db
      .query(NoticeModel)
      .where('tenant_id', '=', deps.tenantId)
      .where('id', '=', id)
      .select('status')
      .get();
    if (!current) throw new NotFoundError('通知不存在');
    if (current.status === 1) {
      throw new VentoStackError('已发布通知必须先撤回', 409, 'NOTICE_STATE_CONFLICT');
    }
    await db
      .query(NoticeModel)
      .where('tenant_id', '=', deps.tenantId)
      .where('id', '=', id)
      .delete();
  }

  async function list(params?: NoticeListParams): Promise<PaginatedResult<NoticeItem>> {
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 10;

    let query = db.query(NoticeModel).where('tenant_id', '=', deps.tenantId);
    if (params?.title) query = query.where('title', 'LIKE', `%${params.title}%`);
    if (params?.type !== undefined) {
      query = query.where('type', '=', params.type);
    }
    if (params?.status !== undefined) {
      query = query.where('status', '=', params.status);
    }

    const total = await query.count();

    const rows = await query
      .select(
        'id',
        'title',
        'content',
        'type',
        'sort',
        'status',
        'publisher_id',
        'publish_at',
        'remark',
        'created_at',
      )
      .orderBy('sort', 'desc')
      .orderBy('created_at', 'desc')
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .list();

    const items: NoticeItem[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      content: row.content,
      type: row.type ?? 1,
      sort: row.sort ?? 0,
      status: row.status ?? 0,
      publisherId: row.publisher_id ?? '',
      publishAt: row.publish_at ? String(row.publish_at) : null,
      remark: row.remark ?? '',
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at ?? ''),
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
    const updated = await db
      .query(NoticeModel)
      .where('tenant_id', '=', deps.tenantId)
      .where('id', '=', id)
      .where('status', 'IN', [0, 2])
      .update(
        { status: 1, publisher_id: publisherId, publish_at: new Date() },
        { returning: true },
      );
    if (!updated) await assertNoticeState(id, () => '仅草稿或已撤回状态的通知可发布');
  }

  async function publishApproved(id: string, publisherId: string): Promise<void> {
    const current = await db
      .query(NoticeModel)
      .where('tenant_id', '=', deps.tenantId)
      .where('id', '=', id)
      .select('status')
      .get();
    if (!current) throw new NotFoundError('通知不存在');
    if (current.status === 1) return;
    await publish(id, publisherId);
  }

  async function revoke(id: string): Promise<void> {
    const updated = await db
      .query(NoticeModel)
      .where('tenant_id', '=', deps.tenantId)
      .where('id', '=', id)
      .where('status', '=', 1)
      .update({ status: 2, publish_at: null }, { returning: true });
    if (!updated) await assertNoticeState(id, () => '仅已发布状态的通知可撤回');
  }

  async function markRead(userId: string, noticeId: string): Promise<void> {
    // ON CONFLICT DO NOTHING — use db.raw for this pattern
    await db.raw(
      `INSERT INTO sys_user_notice (tenant_id, user_id, notice_id, read_at)
       SELECT $1, $2, n.id, $4 FROM sys_notice n
       WHERE n.tenant_id = $1 AND n.id = $3 AND n.status = 1 AND n.deleted_at IS NULL
       ON CONFLICT DO NOTHING`,
      [deps.tenantId, userId, noticeId, new Date()],
    );
  }

  async function getUnreadCount(userId: string): Promise<number> {
    // NOT EXISTS subquery — use db.raw
    const rows = (await db.raw(
      'SELECT COUNT(*) AS cnt FROM sys_notice n WHERE n.tenant_id = $1 AND n.deleted_at IS NULL AND n.status = 1 AND NOT EXISTS (SELECT 1 FROM sys_user_notice un WHERE un.tenant_id = $1 AND un.user_id = $2 AND un.notice_id = n.id)',
      [deps.tenantId, userId],
    )) as Array<Record<string, unknown>>;
    return Number(rows[0]?.cnt ?? 0);
  }

  async function markBatchRead(userId: string, noticeIds: string[]): Promise<void> {
    if (noticeIds.length === 0) return;
    const now = new Date();
    for (const noticeId of noticeIds) {
      await db.raw(
        `INSERT INTO sys_user_notice (tenant_id, user_id, notice_id, read_at)
         SELECT $1, $2, n.id, $4 FROM sys_notice n
         WHERE n.tenant_id = $1 AND n.id = $3 AND n.status = 1 AND n.deleted_at IS NULL
         ON CONFLICT DO NOTHING`,
        [deps.tenantId, userId, noticeId, now],
      );
    }
  }

  async function listPublishedForUser(
    userId: string,
    params?: { page?: number; pageSize?: number },
  ): Promise<PaginatedResult<UserNoticeItem>> {
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 10;

    // 查询已发布通知总数
    const countRows = (await db.raw(
      'SELECT COUNT(*) AS cnt FROM sys_notice n WHERE n.tenant_id = $1 AND n.deleted_at IS NULL AND n.status = 1',
      [deps.tenantId],
    )) as Array<Record<string, unknown>>;
    const total = Number(countRows[0]?.cnt ?? 0);

    // LEFT JOIN 获取已读状态
    const rows = (await db.raw(
      `SELECT n.id, n.title, n.content, n.type, n.sort, n.status, n.publisher_id, n.publish_at, n.remark, n.created_at,
              (un.read_at IS NOT NULL) AS is_read
       FROM sys_notice n
       LEFT JOIN sys_user_notice un ON un.tenant_id = $1 AND un.user_id = $2 AND un.notice_id = n.id
       WHERE n.tenant_id = $1 AND n.deleted_at IS NULL AND n.status = 1
       ORDER BY n.sort DESC, n.publish_at DESC
       LIMIT $3 OFFSET $4`,
      [deps.tenantId, userId, pageSize, (page - 1) * pageSize],
    )) as Array<Record<string, unknown>>;

    const items: UserNoticeItem[] = rows.map((row) => ({
      id: String(row.id),
      title: String(row.title ?? ''),
      content: String(row.content ?? ''),
      type: Number(row.type ?? 1),
      sort: Number(row.sort ?? 0),
      status: Number(row.status ?? 0),
      publisherId: String(row.publisher_id ?? ''),
      publishAt: row.publish_at ? String(row.publish_at) : null,
      remark: String(row.remark ?? ''),
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at ?? ''),
      isRead: Boolean(row.is_read),
    }));

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
    };
  }

  return {
    create,
    update,
    delete: deleteNotice,
    list,
    publishApproved,
    revoke,
    markRead,
    markBatchRead,
    getUnreadCount,
    listPublishedForUser,
  };
}

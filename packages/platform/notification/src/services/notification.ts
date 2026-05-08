/**
 * @ventostack/notify - 通知服务
 */

import type { Database } from "@ventostack/database";
import { NotifyTemplateModel, NotifyMessageModel, NotifyUserReadModel } from "../models";

/** 通知通道接口 */
export interface NotifyChannel {
  name: string;
  send(params: { to: string; title: string; content: string }): Promise<{ success: boolean; error?: string }>;
}

/** 通知模板 */
export interface NotifyTemplate {
  id: string;
  name: string;
  code: string;
  channel: string;
  title: string | null;
  content: string;
  status: number;
}

/** 通知消息 */
export interface NotifyMessage {
  id: string;
  templateId: string | null;
  channel: string;
  receiverId: string;
  title: string | null;
  content: string;
  variables: Record<string, unknown> | null;
  status: number;
  retryCount: number;
  sendAt: string | null;
  error: string | null;
  createdAt: string;
}

/** 分页结果 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 消息状态 */
export const MessageStatus = {
  PENDING: 0,
  SENT: 1,
  FAILED: 2,
} as const;

/** 模板状态 */
export const TemplateStatus = {
  DISABLED: 0,
  ACTIVE: 1,
} as const;

/** 通知服务接口 */
export interface NotificationService {
  send(params: {
    templateId?: string;
    receiverId: string;
    channel: string;
    title?: string;
    content: string;
    variables?: Record<string, unknown>;
  }): Promise<{ messageId: string }>;

  listMessages(params: {
    receiverId?: string;
    channel?: string;
    status?: number;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResult<NotifyMessage>>;

  getUnreadCount(userId: string): Promise<number>;
  markRead(userId: string, messageId: string): Promise<void>;
  markBatchRead(userId: string, messageIds: string[]): Promise<void>;
  retry(messageId: string): Promise<void>;

  // Template CRUD
  createTemplate(params: {
    name: string;
    code: string;
    channel: string;
    title?: string;
    content: string;
  }): Promise<{ id: string }>;

  updateTemplate(id: string, params: Partial<{ name: string; title: string; content: string; status: number }>): Promise<void>;
  deleteTemplate(id: string): Promise<void>;
  listTemplates(params?: { channel?: string; page?: number; pageSize?: number }): Promise<PaginatedResult<NotifyTemplate>>;
}

/** 通知服务依赖 */
export interface NotificationServiceDeps {
  db: Database;
  channels: Map<string, NotifyChannel>;
}

export function createNotificationService(deps: NotificationServiceDeps): NotificationService {
  const { db, channels } = deps;

  async function renderTemplate(templateId: string, variables?: Record<string, unknown>): Promise<{ title: string; content: string } | null> {
    const tpl = await db.query(NotifyTemplateModel)
      .where("id", "=", templateId)
      .select("title", "content")
      .get();
    if (!tpl) return null;

    let title = tpl.title ?? "";
    let content = tpl.content;

    if (variables) {
      for (const [key, value] of Object.entries(variables)) {
        const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, "g");
        title = title.replace(placeholder, String(value));
        content = content.replace(placeholder, String(value));
      }
    }

    return { title, content };
  }

  return {
    async send(params) {
      const messageId = crypto.randomUUID();
      let { title, content } = params;

      // If templateId provided, render template
      if (params.templateId) {
        const rendered = await renderTemplate(params.templateId, params.variables);
        if (rendered) {
          title = rendered.title;
          content = rendered.content;
        }
      }

      // Send via channel
      const channel = channels.get(params.channel);
      let status: number = MessageStatus.PENDING;
      let sendAt: Date | null = null;
      let error: string | null = null;

      if (channel) {
        const result = await channel.send({
          to: params.receiverId,
          title: title ?? "",
          content,
        });
        status = result.success ? MessageStatus.SENT : MessageStatus.FAILED;
        sendAt = result.success ? new Date() : null;
        error = result.error ?? null;
      }

      await db.query(NotifyMessageModel).insert({
        id: messageId,
        template_id: params.templateId ?? null,
        channel: params.channel,
        receiver_id: params.receiverId,
        title: title ?? null,
        content,
        variables: params.variables ? JSON.stringify(params.variables) : null,
        status,
        retry_count: 0,
        send_at: sendAt,
        error,
      });

      return { messageId };
    },

    async listMessages(params) {
      const { receiverId, channel, status, page = 1, pageSize = 10 } = params;

      let query = db.query(NotifyMessageModel);
      if (receiverId) query = query.where("receiver_id", "=", receiverId);
      if (channel) query = query.where("channel", "=", channel);
      if (status !== undefined) query = query.where("status", "=", status);

      const total = await query.count();

      const rows = await query
        .select("id", "template_id", "channel", "receiver_id", "title", "content", "variables", "status", "retry_count", "send_at", "error", "created_at")
        .orderBy("created_at", "desc")
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .list();

      const items = rows.map((row) => ({
        id: row.id,
        templateId: row.template_id ?? null,
        channel: row.channel,
        receiverId: row.receiver_id,
        title: row.title ?? null,
        content: row.content,
        variables: row.variables ? JSON.parse(row.variables as string) : null,
        status: row.status,
        retryCount: row.retry_count,
        sendAt: row.send_at ? row.send_at.toISOString() : null,
        error: row.error ?? null,
        createdAt: row.created_at.toISOString(),
      }));

      return { items, total, page, pageSize, totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0 };
    },

    async getUnreadCount(userId) {
      // NOT EXISTS subquery — keep as db.raw
      const rows = await db.raw(
        `SELECT COUNT(*) as total FROM sys_notify_message m
         WHERE m.receiver_id = $1 AND m.status = ${MessageStatus.SENT}
         AND NOT EXISTS (SELECT 1 FROM sys_notify_user_read r WHERE r.user_id = $1 AND r.message_id = m.id)`,
        [userId],
      ) as Array<{ total: number }>;
      return Number(rows[0]?.total ?? 0);
    },

    async markRead(userId, messageId) {
      // ON CONFLICT — keep as db.raw
      await db.raw(
        `INSERT INTO sys_notify_user_read (id, user_id, message_id, read_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id, message_id) DO NOTHING`,
        [crypto.randomUUID(), userId, messageId],
      );
    },

    async markBatchRead(userId, messageIds) {
      for (const messageId of messageIds) {
        await db.raw(
          `INSERT INTO sys_notify_user_read (id, user_id, message_id, read_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (user_id, message_id) DO NOTHING`,
          [crypto.randomUUID(), userId, messageId],
        );
      }
    },

    async retry(messageId) {
      const msg = await db.query(NotifyMessageModel)
        .where("id", "=", messageId)
        .select("id", "channel", "receiver_id", "title", "content")
        .get();
      if (!msg) throw new Error("消息不存在");

      const channel = channels.get(msg.channel);
      if (!channel) {
        await db.query(NotifyMessageModel).where("id", "=", messageId).update({
          status: MessageStatus.FAILED,
          error: "Channel not found",
        });
        return;
      }

      const result = await channel.send({
        to: msg.receiver_id,
        title: msg.title ?? "",
        content: msg.content,
      });

      const status = result.success ? MessageStatus.SENT : MessageStatus.FAILED;
      const sendAt = result.success ? new Date() : null;

      await db.query(NotifyMessageModel).where("id", "=", messageId).update({
        status,
        send_at: sendAt,
        error: result.error ?? null,
      });
    },

    async createTemplate(params) {
      const id = crypto.randomUUID();
      await db.query(NotifyTemplateModel).insert({
        id,
        name: params.name,
        code: params.code,
        channel: params.channel,
        title: params.title ?? null,
        content: params.content,
        status: TemplateStatus.ACTIVE,
      });
      return { id };
    },

    async updateTemplate(id, params) {
      const updates: Record<string, unknown> = {};
      if (params.name !== undefined) updates.name = params.name;
      if (params.title !== undefined) updates.title = params.title;
      if (params.content !== undefined) updates.content = params.content;
      if (params.status !== undefined) updates.status = params.status;

      if (Object.keys(updates).length === 0) return;
      await db.query(NotifyTemplateModel).where("id", "=", id).update(updates);
    },

    async deleteTemplate(id) {
      await db.query(NotifyTemplateModel).where("id", "=", id).hardDelete();
    },

    async listTemplates(params) {
      const { channel, page = 1, pageSize = 10 } = params ?? {};

      let query = db.query(NotifyTemplateModel);
      if (channel) query = query.where("channel", "=", channel);

      const total = await query.count();

      const rows = await query
        .select("id", "name", "code", "channel", "title", "content", "status")
        .orderBy("created_at", "desc")
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .list();

      const items = rows.map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        channel: row.channel,
        title: row.title ?? null,
        content: row.content,
        status: row.status,
      }));

      return { items, total, page, pageSize, totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0 };
    },
  };
}

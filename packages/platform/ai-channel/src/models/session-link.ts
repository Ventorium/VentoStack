/**
 * ai_channel_session 读写 —— 反向闭环的枢纽
 *
 * 这张表把「外部会话」和「AI 会话」绑在一起：
 *   出站（channel_send / 自动推送）写一行 externalKey → sessionId
 *   入站（用户回复）按 externalKey 查回 sessionId，带着完整上下文继续
 *
 * 因此渠道不是第二套会话体系，而是同一个 session 的另一个 I/O 入口。
 */

import type { Database } from '@ventostack/database';
import type { ChannelSessionRow } from '../types';

export interface ChannelSessionDao {
  /** 入站解析：按 (渠道, externalKey) 找绑定 */
  findByKey(channelId: string, externalKey: string): Promise<ChannelSessionRow | null>;
  /** 现有绑定是否指向某会话（出站判断「当前会话是否就在该渠道」） */
  findBySession(channelId: string, sessionId: string): Promise<ChannelSessionRow[]>;
  /** 新建或改写绑定（/新对话、/切换、通知反绑都用它） */
  upsert(input: {
    channelId: string;
    tenantId: string;
    userId: string;
    externalKey: string;
    sessionId: string;
    agentId?: string | null;
    origin: 'inbound' | 'notify';
    replyContext?: Record<string, unknown>;
  }): Promise<void>;
  touch(channelId: string, externalKey: string): Promise<void>;
  /** 删渠道时级联由外键处理；删单个绑定用于 /新对话 前清理 */
  remove(channelId: string, externalKey: string): Promise<void>;
  countByChannel(channelId: string): Promise<number>;
}

export function createChannelSessionDao(deps: { db: Database }): ChannelSessionDao {
  const { db } = deps;

  return {
    async findByKey(channelId: string, externalKey: string): Promise<ChannelSessionRow | null> {
      const rows = (await db.raw(
        'SELECT * FROM ai_channel_session WHERE channel_id = $1 AND external_key = $2',
        [channelId, externalKey],
      )) as ChannelSessionRow[];
      return rows[0] ?? null;
    },

    async findBySession(channelId: string, sessionId: string): Promise<ChannelSessionRow[]> {
      return (await db.raw(
        'SELECT * FROM ai_channel_session WHERE channel_id = $1 AND session_id = $2',
        [channelId, sessionId],
      )) as ChannelSessionRow[];
    },

    async upsert(input): Promise<void> {
      await db.raw(
        `INSERT INTO ai_channel_session
           (id, channel_id, tenant_id, user_id, external_key, session_id, agent_id,
            origin, reply_context, last_message_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, CURRENT_TIMESTAMP)
         ON CONFLICT (channel_id, external_key) DO UPDATE SET
           session_id = EXCLUDED.session_id,
           agent_id = COALESCE(EXCLUDED.agent_id, ai_channel_session.agent_id),
           origin = EXCLUDED.origin,
           reply_context = CASE
             WHEN EXCLUDED.reply_context = '{}'::jsonb THEN ai_channel_session.reply_context
             ELSE EXCLUDED.reply_context
           END,
           last_message_at = CURRENT_TIMESTAMP`,
        [
          crypto.randomUUID(),
          input.channelId,
          input.tenantId,
          input.userId,
          input.externalKey,
          input.sessionId,
          input.agentId ?? null,
          input.origin,
          JSON.stringify(input.replyContext ?? {}),
        ],
      );
    },

    async touch(channelId: string, externalKey: string): Promise<void> {
      await db.raw(
        `UPDATE ai_channel_session SET last_message_at = CURRENT_TIMESTAMP
          WHERE channel_id = $1 AND external_key = $2`,
        [channelId, externalKey],
      );
    },

    async remove(channelId: string, externalKey: string): Promise<void> {
      await db.raw('DELETE FROM ai_channel_session WHERE channel_id = $1 AND external_key = $2', [
        channelId,
        externalKey,
      ]);
    },

    async countByChannel(channelId: string): Promise<number> {
      const rows = (await db.raw(
        'SELECT COUNT(*)::int AS total FROM ai_channel_session WHERE channel_id = $1',
        [channelId],
      )) as Array<{ total: number }>;
      return rows[0]?.total ?? 0;
    },
  };
}

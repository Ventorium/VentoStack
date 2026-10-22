/**
 * ai_channel_message 读写 —— 入站幂等 + 出站队列 + 审计
 *
 * 幂等：平台重投很常见（处理超时后重发），唯一索引 (channel_id, direction,
 * external_message_id) 保证同一消息只处理一次。这比"在内存里记最近 id"可靠，
 * 多实例部署时也成立。
 */

import type { Database } from '@ventostack/database';
import type { ChannelMessageRow, OutboundKind } from '../types';

/** 出站重试退避（毫秒）：1s → 5s → 30s → 2m → 10m */
export const RETRY_BACKOFF_MS = [1_000, 5_000, 30_000, 120_000, 600_000] as const;
export const MAX_SEND_ATTEMPTS = 5;

export interface EnqueueOutboundInput {
  channelId: string;
  tenantId: string;
  kind: OutboundKind;
  externalKey: string | null;
  sessionId: string | null;
  text: string;
  /** 去重键（如 runId）：同一 run 的自动推送只发一次 */
  dedupKey?: string | null;
}

export interface MessageDao {
  /** 记录入站消息；返回 false 表示重复消息（已处理过） */
  tryRecordInbound(input: {
    channelId: string;
    tenantId: string;
    externalMessageId: string;
    externalKey: string;
    sessionId?: string | null;
    preview: string;
  }): Promise<boolean>;
  markInbound(
    channelId: string,
    externalMessageId: string,
    status: 'processing' | 'done' | 'failed' | 'dropped',
    error?: string | null,
    sessionId?: string | null,
  ): Promise<void>;

  enqueueOutbound(input: EnqueueOutboundInput): Promise<string | null>;
  /** 抢占待发送任务（多实例安全） */
  claimOutbox(limit: number): Promise<ChannelMessageRow[]>;
  markSent(id: string): Promise<void>;
  markFailed(id: string, error: string, retryable: boolean, attempts: number): Promise<void>;

  countPending(channelId: string): Promise<number>;
  listRecent(
    channelId: string,
    tenantId: string,
    limit: number,
    offset: number,
  ): Promise<ChannelMessageRow[]>;
  countRecent(channelId: string, tenantId: string): Promise<number>;
}

export function createMessageDao(deps: { db: Database }): MessageDao {
  const { db } = deps;

  return {
    async tryRecordInbound(input): Promise<boolean> {
      const rows = (await db.raw(
        `INSERT INTO ai_channel_message
           (id, channel_id, tenant_id, direction, kind, external_message_id, external_key,
            session_id, status, payload_preview)
         VALUES ($1, $2, $3, 'in', 'reply', $4, $5, $6, 'received', $7)
         ON CONFLICT (channel_id, direction, external_message_id)
           WHERE external_message_id IS NOT NULL DO NOTHING
         RETURNING id`,
        [
          crypto.randomUUID(),
          input.channelId,
          input.tenantId,
          input.externalMessageId,
          input.externalKey,
          input.sessionId ?? null,
          input.preview.slice(0, 200),
        ],
      )) as Array<{ id: string }>;
      return rows.length > 0;
    },

    async markInbound(channelId, externalMessageId, status, error, sessionId): Promise<void> {
      await db.raw(
        `UPDATE ai_channel_message
            SET status = $3,
                error = $4,
                session_id = COALESCE($5, session_id),
                updated_at = CURRENT_TIMESTAMP
          WHERE channel_id = $1 AND direction = 'in' AND external_message_id = $2`,
        [channelId, externalMessageId, status, error ?? null, sessionId ?? null],
      );
    },

    async enqueueOutbound(input): Promise<string | null> {
      const id = crypto.randomUUID();
      // dedupKey 复用 external_message_id 列做「同 run 只发一次」的唯一约束；
      // payload 存完整正文供重试，payload_preview 只存前 200 字供列表展示
      const rows = (await db.raw(
        `INSERT INTO ai_channel_message
           (id, channel_id, tenant_id, direction, kind, external_message_id, external_key,
            session_id, status, payload, payload_preview, next_retry_at)
         VALUES ($1, $2, $3, 'out', $4, $5, $6, $7, 'queued', $8, $9, CURRENT_TIMESTAMP)
         ON CONFLICT (channel_id, direction, external_message_id)
           WHERE external_message_id IS NOT NULL DO NOTHING
         RETURNING id`,
        [
          id,
          input.channelId,
          input.tenantId,
          input.kind,
          input.dedupKey ?? null,
          input.externalKey,
          input.sessionId,
          input.text,
          input.text.slice(0, 200),
        ],
      )) as Array<{ id: string }>;
      return rows[0]?.id ?? null;
    },

    async claimOutbox(limit: number): Promise<ChannelMessageRow[]> {
      // SKIP LOCKED：多实例同时扫队列时各取各的，不会重复发送
      return (await db.raw(
        `UPDATE ai_channel_message SET status = 'processing', updated_at = CURRENT_TIMESTAMP
          WHERE id IN (
            SELECT id FROM ai_channel_message
             WHERE direction = 'out' AND status IN ('queued', 'failed')
               AND (next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP)
             ORDER BY next_retry_at NULLS FIRST
             LIMIT $1
             FOR UPDATE SKIP LOCKED
          )
          RETURNING *`,
        [limit],
      )) as ChannelMessageRow[];
    },

    async markSent(id: string): Promise<void> {
      await db.raw(
        `UPDATE ai_channel_message
            SET status = 'sent', error = NULL, attempts = attempts + 1,
                next_retry_at = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [id],
      );
    },

    async markFailed(
      id: string,
      error: string,
      retryable: boolean,
      attempts: number,
    ): Promise<void> {
      const next = retryable && attempts < MAX_SEND_ATTEMPTS;
      const delay = RETRY_BACKOFF_MS[Math.min(attempts, RETRY_BACKOFF_MS.length - 1)] ?? 600_000;
      await db.raw(
        `UPDATE ai_channel_message
            SET status = $2, error = $3, attempts = $4,
                next_retry_at = $5, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [
          id,
          next ? 'failed' : 'dropped',
          error.slice(0, 500),
          attempts,
          next ? new Date(Date.now() + delay) : null,
        ],
      );
    },

    async countPending(channelId: string): Promise<number> {
      const rows = (await db.raw(
        `SELECT COUNT(*)::int AS total FROM ai_channel_message
          WHERE channel_id = $1 AND direction = 'out' AND status IN ('queued', 'failed')`,
        [channelId],
      )) as Array<{ total: number }>;
      return rows[0]?.total ?? 0;
    },

    async listRecent(
      channelId: string,
      tenantId: string,
      limit: number,
      offset: number,
    ): Promise<ChannelMessageRow[]> {
      return (await db.raw(
        `SELECT * FROM ai_channel_message
          WHERE channel_id = $1 AND tenant_id = $2
          ORDER BY created_at DESC
          LIMIT $3 OFFSET $4`,
        [channelId, tenantId, limit, offset],
      )) as ChannelMessageRow[];
    },

    async countRecent(channelId: string, tenantId: string): Promise<number> {
      const rows = (await db.raw(
        `SELECT COUNT(*)::int AS total FROM ai_channel_message
          WHERE channel_id = $1 AND tenant_id = $2`,
        [channelId, tenantId],
      )) as Array<{ total: number }>;
      return rows[0]?.total ?? 0;
    },
  };
}

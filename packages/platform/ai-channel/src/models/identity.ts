/**
 * ai_channel_identity + ai_channel_bind_code 读写
 *
 * 身份绑定是「谁可以使用这个渠道」的唯一依据。未绑定一律 fail-closed：
 * 不进 Agent、不耗 token，只回绑定引导。
 */

import type { Database } from '@ventostack/database';
import type { IdentityRow } from '../types';

export interface BindCodeRow {
  code: string;
  channel_id: string;
  tenant_id: string;
  user_id: string;
  expires_at: Date;
  consumed_at: Date | null;
}

export interface IdentityDao {
  /** 按外部 id 查绑定（入站身份解析） */
  findByExternal(channelId: string, externalUserId: string): Promise<IdentityRow | null>;
  /** 某渠道下当前用户已绑定的账号 */
  listByChannel(channelId: string, tenantId: string, userId: string): Promise<IdentityRow[]>;
  /** 当前用户名下所有渠道的绑定（出站目标解析、channel_list 用） */
  listByUser(tenantId: string, userId: string): Promise<IdentityRow[]>;
  upsert(input: {
    channelId: string;
    tenantId: string;
    userId: string;
    externalUserId: string;
    externalChatId?: string | null;
    displayName?: string | null;
  }): Promise<void>;
  updateChatId(identityId: string, externalChatId: string): Promise<void>;
  remove(identityId: string, tenantId: string, userId: string): Promise<boolean>;

  createBindCode(input: {
    code: string;
    channelId: string;
    tenantId: string;
    userId: string;
    expiresAt: Date;
  }): Promise<void>;
  /** 取未消费且未过期的码（校验同时发生在消费时） */
  getBindCode(code: string): Promise<BindCodeRow | null>;
  consumeBindCode(code: string): Promise<boolean>;
  countRecentBindCodes(tenantId: string, userId: string, sinceMs: number): Promise<number>;
}

export function createIdentityDao(deps: { db: Database }): IdentityDao {
  const { db } = deps;

  return {
    async findByExternal(channelId: string, externalUserId: string): Promise<IdentityRow | null> {
      const rows = (await db.raw(
        `SELECT * FROM ai_channel_identity
          WHERE channel_id = $1 AND external_user_id = $2`,
        [channelId, externalUserId],
      )) as IdentityRow[];
      return rows[0] ?? null;
    },

    async listByChannel(
      channelId: string,
      tenantId: string,
      userId: string,
    ): Promise<IdentityRow[]> {
      return (await db.raw(
        `SELECT * FROM ai_channel_identity
          WHERE channel_id = $1 AND tenant_id = $2 AND user_id = $3
          ORDER BY created_at DESC`,
        [channelId, tenantId, userId],
      )) as IdentityRow[];
    },

    async listByUser(tenantId: string, userId: string): Promise<IdentityRow[]> {
      return (await db.raw(
        `SELECT * FROM ai_channel_identity
          WHERE tenant_id = $1 AND user_id = $2
          ORDER BY created_at DESC`,
        [tenantId, userId],
      )) as IdentityRow[];
    },

    async upsert(input): Promise<void> {
      await db.raw(
        `INSERT INTO ai_channel_identity
           (id, channel_id, tenant_id, user_id, external_user_id, external_chat_id,
            display_name, verified_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
         ON CONFLICT (channel_id, external_user_id) DO UPDATE SET
           external_chat_id = COALESCE(EXCLUDED.external_chat_id, ai_channel_identity.external_chat_id),
           display_name = COALESCE(EXCLUDED.display_name, ai_channel_identity.display_name),
           verified_at = CURRENT_TIMESTAMP`,
        [
          crypto.randomUUID(),
          input.channelId,
          input.tenantId,
          input.userId,
          input.externalUserId,
          input.externalChatId ?? null,
          input.displayName ?? null,
        ],
      );
    },

    async updateChatId(identityId: string, externalChatId: string): Promise<void> {
      await db.raw('UPDATE ai_channel_identity SET external_chat_id = $2 WHERE id = $1', [
        identityId,
        externalChatId,
      ]);
    },

    async remove(identityId: string, tenantId: string, userId: string): Promise<boolean> {
      const rows = (await db.raw(
        `DELETE FROM ai_channel_identity
          WHERE id = $1 AND tenant_id = $2 AND user_id = $3
          RETURNING id`,
        [identityId, tenantId, userId],
      )) as Array<{ id: string }>;
      return rows.length > 0;
    },

    async createBindCode(input): Promise<void> {
      await db.raw(
        `INSERT INTO ai_channel_bind_code (code, channel_id, tenant_id, user_id, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [input.code, input.channelId, input.tenantId, input.userId, input.expiresAt],
      );
    },

    async getBindCode(code: string): Promise<BindCodeRow | null> {
      const rows = (await db.raw(
        `SELECT * FROM ai_channel_bind_code
          WHERE code = $1 AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP`,
        [code],
      )) as BindCodeRow[];
      return rows[0] ?? null;
    },

    async consumeBindCode(code: string): Promise<boolean> {
      // 条件更新保证一次性：并发消费只有一个 affected row
      const rows = (await db.raw(
        `UPDATE ai_channel_bind_code
            SET consumed_at = CURRENT_TIMESTAMP
          WHERE code = $1 AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP
          RETURNING code`,
        [code],
      )) as Array<{ code: string }>;
      return rows.length > 0;
    },

    async countRecentBindCodes(tenantId: string, userId: string, sinceMs: number): Promise<number> {
      const rows = (await db.raw(
        `SELECT COUNT(*)::int AS total FROM ai_channel_bind_code
          WHERE tenant_id = $1 AND user_id = $2
            AND created_at > CURRENT_TIMESTAMP - ($3::int * INTERVAL '1 millisecond')`,
        [tenantId, userId, sinceMs],
      )) as Array<{ total: number }>;
      return rows[0]?.total ?? 0;
    },
  };
}

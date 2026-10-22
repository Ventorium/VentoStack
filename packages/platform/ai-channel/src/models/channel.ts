/**
 * ai_channel 表读写
 *
 * 所有方法强制 tenant_id + user_id 双条件（个人级资源，不做租户共享）。
 * 匿名入站没有登录态，只能按 id 取，此时由调用方额外校验 enabled 与签名。
 */

import type { Database } from '@ventostack/database';
import type { ChannelRow, ChannelStatus, ChannelType } from '../types';

export interface CreateChannelInput {
  id: string;
  tenantId: string;
  userId: string;
  type: ChannelType;
  name: string;
  config: Record<string, unknown>;
  /** 已加密的凭证包（JSON 字符串） */
  secrets: string | null;
  runtimeState?: Record<string, unknown>;
  agentId?: string | null;
  enabled?: boolean;
  status?: ChannelStatus;
}

export interface ChannelPatch {
  name?: string;
  config?: Record<string, unknown>;
  secrets?: string | null;
  agentId?: string | null;
  enabled?: boolean;
  status?: ChannelStatus;
  statusDetail?: string | null;
}

export interface ChannelDao {
  list(tenantId: string, userId: string): Promise<ChannelRow[]>;
  getById(id: string, tenantId: string, userId: string): Promise<ChannelRow | null>;
  /** 匿名入站用：只按 id 取（调用方必须校验 enabled） */
  getByIdUnscoped(id: string): Promise<ChannelRow | null>;
  listEnabled(): Promise<ChannelRow[]>;
  create(input: CreateChannelInput): Promise<void>;
  update(id: string, tenantId: string, userId: string, patch: ChannelPatch): Promise<boolean>;
  remove(id: string, tenantId: string, userId: string): Promise<boolean>;
  setStatus(id: string, status: ChannelStatus, detail?: string | null): Promise<void>;
  /** 合并写运行态（游标/票据），只做浅合并，避免覆盖其他字段 */
  patchRuntimeState(id: string, patch: Record<string, unknown>): Promise<void>;
  touchActive(id: string): Promise<void>;
}

export function createChannelDao(deps: { db: Database }): ChannelDao {
  const { db } = deps;

  return {
    async list(tenantId: string, userId: string): Promise<ChannelRow[]> {
      return (await db.raw(
        'SELECT * FROM ai_channel WHERE tenant_id = $1 AND user_id = $2 ORDER BY created_at ASC',
        [tenantId, userId],
      )) as ChannelRow[];
    },

    async getById(id: string, tenantId: string, userId: string): Promise<ChannelRow | null> {
      const rows = (await db.raw(
        'SELECT * FROM ai_channel WHERE id = $1 AND tenant_id = $2 AND user_id = $3',
        [id, tenantId, userId],
      )) as ChannelRow[];
      return rows[0] ?? null;
    },

    async getByIdUnscoped(id: string): Promise<ChannelRow | null> {
      const rows = (await db.raw('SELECT * FROM ai_channel WHERE id = $1', [id])) as ChannelRow[];
      return rows[0] ?? null;
    },

    async listEnabled(): Promise<ChannelRow[]> {
      return (await db.raw(
        'SELECT * FROM ai_channel WHERE enabled = TRUE ORDER BY created_at ASC',
      )) as ChannelRow[];
    },

    async create(input: CreateChannelInput): Promise<void> {
      await db.raw(
        `INSERT INTO ai_channel
           (id, tenant_id, user_id, type, name, config, secrets, runtime_state, agent_id,
            enabled, status)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9, $10, $11)`,
        [
          input.id,
          input.tenantId,
          input.userId,
          input.type,
          input.name,
          JSON.stringify(input.config),
          input.secrets,
          JSON.stringify(input.runtimeState ?? {}),
          input.agentId ?? null,
          input.enabled ?? false,
          input.status ?? 'inactive',
        ],
      );
    },

    async update(
      id: string,
      tenantId: string,
      userId: string,
      patch: ChannelPatch,
    ): Promise<boolean> {
      const sets: string[] = [];
      const values: unknown[] = [id, tenantId, userId];

      const push = (column: string, value: unknown, cast = ''): void => {
        values.push(value);
        sets.push(`${column} = $${values.length}${cast}`);
      };

      if (patch.name !== undefined) push('name', patch.name);
      if (patch.config !== undefined) push('config', JSON.stringify(patch.config), '::jsonb');
      if (patch.secrets !== undefined) push('secrets', patch.secrets);
      if (patch.agentId !== undefined) push('agent_id', patch.agentId);
      if (patch.enabled !== undefined) push('enabled', patch.enabled);
      if (patch.status !== undefined) push('status', patch.status);
      if (patch.statusDetail !== undefined) push('status_detail', patch.statusDetail);
      if (sets.length === 0) return true;

      sets.push('updated_at = CURRENT_TIMESTAMP');
      const rows = (await db.raw(
        `UPDATE ai_channel SET ${sets.join(', ')}
          WHERE id = $1 AND tenant_id = $2 AND user_id = $3
          RETURNING id`,
        values,
      )) as Array<{ id: string }>;
      return rows.length > 0;
    },

    async remove(id: string, tenantId: string, userId: string): Promise<boolean> {
      const rows = (await db.raw(
        'DELETE FROM ai_channel WHERE id = $1 AND tenant_id = $2 AND user_id = $3 RETURNING id',
        [id, tenantId, userId],
      )) as Array<{ id: string }>;
      return rows.length > 0;
    },

    async setStatus(id: string, status: ChannelStatus, detail?: string | null): Promise<void> {
      await db.raw(
        `UPDATE ai_channel
            SET status = $2, status_detail = $3, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [id, status, detail ?? null],
      );
    },

    async patchRuntimeState(id: string, patch: Record<string, unknown>): Promise<void> {
      // jsonb || 做浅合并：只更新本次的键，不影响其它游标/票据
      await db.raw(
        `UPDATE ai_channel
            SET runtime_state = COALESCE(runtime_state, '{}'::jsonb) || $2::jsonb,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [id, JSON.stringify(patch)],
      );
    },

    async touchActive(id: string): Promise<void> {
      await db.raw('UPDATE ai_channel SET last_active_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
    },
  };
}

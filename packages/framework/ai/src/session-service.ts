/**
 * SessionService — 会话能力的统一入口
 *
 * 为什么要这层抽象：渠道接入后会话创建有 5 类调用方（Web 路由、IM 入站、
 * 通知子智能体、定时任务、运维脚本）。如果各自直接摸 memory，存储细节会扩散到
 * 每个调用点；而本次新增的 ai_session_meta 投影表又必须与渠道表同事务。
 *
 * 存储分层（关键判断）：
 *   - 消息正文 / 工具轨迹 / 分支 / 压缩 → JSONL（不变，会话是一棵树）
 *   - 会话 id / 归属 / 来源 / 会话级设置 → ai_session_meta（需索引与事务）
 *
 * 一致性策略：**JSONL 为准，meta 可重建**。
 *   create() 先写 JSONL，再写 meta；meta 写失败只记日志不阻断（可用性优先）。
 *   get() / list() 发现 meta 缺失时懒修复，另提供 backfill() 供运维补齐。
 */

import type { Database } from '@ventostack/database';
import type { MemoryScope, MemoryService } from './memory/types';

/** 会话来源：Web 页面 / 渠道（IM、IoT）/ 开放 API */
export interface SessionOrigin {
  kind: 'web' | 'channel' | 'api';
  /** 渠道实例 id（kind === 'channel' 时有值） */
  channelId?: string;
  /** 渠道类型，如 weixin-ilink / qqbot / mqtt */
  channelType?: string;
}

/** 渠道通知相关的会话级设置（由 ai-channel 模块读写） */
export interface SessionChannelSettings {
  /** 是否允许把结果推送到渠道 */
  notifyEnabled?: boolean;
  /** 指定渠道 id 列表；空数组 = 用户全部已启用且已绑定的渠道 */
  notifyChannelIds?: string[];
  /** 每轮结束自动推送（由子智能体总结最后一次完整回复） */
  autoNotifyOnFinish?: boolean;
  /** 最近一次通知时间（展示用，由服务端写入） */
  notifiedAt?: string;
}

/** 会话级设置容器，按 namespace 分区，避免不同模块抢同一批字段 */
export interface SessionSettings {
  channel?: SessionChannelSettings;
  [namespace: string]: unknown;
}

/** 会话视图：JSONL 元信息 + meta 投影 */
export interface SessionView {
  sessionId: string;
  tenantId: string;
  userId: string;
  agentId: string;
  title: string | null;
  status: string;
  messageCount: number;
  origin: SessionOrigin;
  settings: SessionSettings;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSessionParams {
  tenantId: string;
  userId: string;
  agentId: string;
  title?: string;
  origin?: SessionOrigin;
}

export interface ListSessionsParams {
  tenantId: string;
  userId: string;
  agentId?: string;
  /** 按来源渠道过滤（undefined = 全部） */
  channelId?: string;
}

export interface SessionService {
  /** 新建会话：JSONL（真相源）+ ai_session_meta（投影） */
  create(params: CreateSessionParams): Promise<{ sessionId: string }>;
  get(sessionId: string, scope: MemoryScope): Promise<SessionView | null>;
  list(params: ListSessionsParams): Promise<SessionView[]>;
  /** 软删除（移入回收站），同时标记 meta 行已删除 */
  delete(sessionId: string, scope: MemoryScope): Promise<void>;

  appendMessage(
    sessionId: string,
    scope: MemoryScope,
    message: { role: string; content: string; model?: string; reasoning?: string },
  ): Promise<void>;
  getHistory(
    sessionId: string,
    scope: MemoryScope,
    limit?: number,
  ): Promise<Array<{ role: string; content: string; model?: string; reasoning?: string }>>;

  /** 按 namespace 读会话设置；meta 缺失返回 null（调用方按「未开启」处理） */
  getSettings<T = SessionSettings>(sessionId: string, scope: MemoryScope): Promise<T | null>;
  /** 合并写设置：顶层 key 为对象时浅合并一层（如 channel），其余覆盖 */
  updateSettings(
    sessionId: string,
    scope: MemoryScope,
    patch: Partial<SessionSettings>,
  ): Promise<SessionSettings>;

  /** 把缺失 meta 的 JSONL 会话补进投影表（运维/启动自愈用） */
  backfill(scope?: MemoryScope): Promise<{ scanned: number; filled: number }>;
}

interface MetaRow {
  session_id: string;
  tenant_id: string;
  user_id: string;
  agent_id: string;
  origin: string;
  origin_channel_id: string | null;
  origin_channel_type: string | null;
  settings: unknown;
}

/** 校验会话归属标识，防止拼进 SQL/日志时被污染（与 buildToolRegistry 同一套规则） */
function assertScopeId(value: string, field: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) {
    throw new Error(`Invalid ${field} for session service`);
  }
}

/** settings 里的 JSONB 可能来自不同驱动形态：string / object / null */
function normalizeSettings(value: unknown): SessionSettings {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as SessionSettings)
        : {};
    } catch {
      return {};
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) return value as SessionSettings;
  return {};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 剔除对象里的 undefined 键。
 * 不做这一步的话，嵌套对象合并时 `{ ...current, ...value }` 会把
 * patch 里的 undefined 覆盖到已有值上；JSON 序列化又会丢掉该键，
 * 结果就是「一次只改一个字段的 patch 顺手删掉了另一个字段」。
 */
function withoutUndefined(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) out[key] = item;
  }
  return out;
}

/** 顶层合并：两侧都是对象则浅合并一层，否则以 patch 覆盖 */
function mergeSettings(base: SessionSettings, patch: Partial<SessionSettings>): SessionSettings {
  const merged: SessionSettings = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const current = merged[key];
    merged[key] =
      isPlainObject(current) && isPlainObject(value)
        ? { ...current, ...withoutUndefined(value) }
        : (value as unknown);
  }
  return merged;
}

function toOrigin(row: MetaRow): SessionOrigin {
  const kind = row.origin === 'channel' || row.origin === 'api' ? row.origin : 'web';
  return {
    kind,
    ...(row.origin_channel_id ? { channelId: row.origin_channel_id } : {}),
    ...(row.origin_channel_type ? { channelType: row.origin_channel_type } : {}),
  };
}

export interface SessionServiceDeps {
  memory: MemoryService;
  /** 会话投影表所在库；缺省时退化为纯 JSONL 模式（settings 读写返回空） */
  db?: Database;
}

export function createSessionService(deps: SessionServiceDeps): SessionService {
  const { memory, db } = deps;

  /** meta 写失败不能阻断建会话：可用性优先，后续由 backfill/懒修复补齐 */
  async function safeUpsertMeta(params: {
    sessionId: string;
    tenantId: string;
    userId: string;
    agentId: string;
    origin: SessionOrigin;
  }): Promise<void> {
    if (!db) return;
    try {
      await db.raw(
        `INSERT INTO ai_session_meta
           (session_id, tenant_id, user_id, agent_id, origin, origin_channel_id, origin_channel_type, settings)
         VALUES ($1, $2, $3, $4, $5, $6, $7, '{}'::jsonb)
         ON CONFLICT (session_id) DO UPDATE SET
           origin = EXCLUDED.origin,
           origin_channel_id = COALESCE(EXCLUDED.origin_channel_id, ai_session_meta.origin_channel_id),
           origin_channel_type = COALESCE(EXCLUDED.origin_channel_type, ai_session_meta.origin_channel_type),
           deleted_at = NULL,
           updated_at = CURRENT_TIMESTAMP`,
        [
          params.sessionId,
          params.tenantId,
          params.userId,
          params.agentId,
          params.origin.kind,
          params.origin.channelId ?? null,
          params.origin.channelType ?? null,
        ],
      );
    } catch (error) {
      console.error(
        `[ai] 写入会话元数据失败（会话仍可用，可后续 backfill）: ${params.sessionId}`,
        error,
      );
    }
  }

  async function getMeta(sessionId: string, scope: MemoryScope): Promise<MetaRow | null> {
    if (!db) return null;
    try {
      const rows = (await db.raw(
        `SELECT session_id, tenant_id, user_id, agent_id, origin, origin_channel_id,
                origin_channel_type, settings
           FROM ai_session_meta
          WHERE session_id = $1 AND tenant_id = $2 AND user_id = $3 AND deleted_at IS NULL`,
        [sessionId, scope.tenantId, scope.userId],
      )) as MetaRow[];
      return rows[0] ?? null;
    } catch (error) {
      console.error('[ai] 读取会话元数据失败:', error);
      return null;
    }
  }

  function toView(
    session: {
      sessionId: string;
      tenantId: string;
      userId: string;
      agentId: string;
      title: string | null;
      status: string;
      messageCount: number;
      createdAt: Date;
      updatedAt: Date;
    },
    meta: MetaRow | null,
  ): SessionView {
    return {
      sessionId: session.sessionId,
      tenantId: session.tenantId,
      userId: session.userId,
      agentId: session.agentId,
      title: session.title,
      status: session.status,
      messageCount: session.messageCount,
      origin: meta ? toOrigin(meta) : { kind: 'web' },
      settings: meta ? normalizeSettings(meta.settings) : {},
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }

  return {
    async create(params: CreateSessionParams): Promise<{ sessionId: string }> {
      assertScopeId(params.tenantId, 'tenantId');
      assertScopeId(params.userId, 'userId');
      // 1) 先写真相源；失败直接抛错，绝不产生孤儿 meta
      const { sessionId } = await memory.createSession({
        userId: params.userId,
        agentId: params.agentId,
        tenantId: params.tenantId,
      });
      // 2) 投影（失败不阻断）
      await safeUpsertMeta({
        sessionId,
        tenantId: params.tenantId,
        userId: params.userId,
        agentId: params.agentId,
        origin: params.origin ?? { kind: 'web' },
      });
      if (params.title) {
        await memory.renameSession(sessionId, params, params.title);
      }
      return { sessionId };
    },

    async get(sessionId: string, scope: MemoryScope): Promise<SessionView | null> {
      const session = await memory.getSession(sessionId, scope);
      if (!session) return null;
      let meta = await getMeta(sessionId, scope);
      if (!meta) {
        // 懒修复：JSONL 存在但投影缺失（历史会话 / 上次 meta 写失败）
        await safeUpsertMeta({
          sessionId,
          tenantId: session.tenantId,
          userId: session.userId,
          agentId: session.agentId,
          origin: { kind: 'web' },
        });
        meta = await getMeta(sessionId, scope);
      }
      return toView(session, meta);
    },

    async list(params: ListSessionsParams): Promise<SessionView[]> {
      const sessions = await memory.listSessions(
        { tenantId: params.tenantId, userId: params.userId },
        params.agentId,
      );
      if (sessions.length === 0) return [];

      const metaMap = new Map<string, MetaRow>();
      if (db) {
        try {
          const ids = sessions.map((s) => s.sessionId);
          const placeholders = ids.map((_, i) => `$${i + 3}`).join(', ');
          const rows = (await db.raw(
            `SELECT session_id, tenant_id, user_id, agent_id, origin, origin_channel_id,
                    origin_channel_type, settings
               FROM ai_session_meta
              WHERE tenant_id = $1 AND user_id = $2 AND session_id IN (${placeholders})`,
            [params.tenantId, params.userId, ...ids],
          )) as MetaRow[];
          for (const row of rows) metaMap.set(row.session_id, row);
        } catch (error) {
          console.error('[ai] 批量读取会话元数据失败（退化为 Web 来源）:', error);
        }
      }

      const views = sessions.map((s) => toView(s, metaMap.get(s.sessionId) ?? null));
      if (!params.channelId) return views;
      return views.filter((v) => v.origin.channelId === params.channelId);
    },

    async delete(sessionId: string, scope: MemoryScope): Promise<void> {
      await memory.moveSessionToTrash(sessionId, scope);
      if (!db) return;
      try {
        await db.raw(
          `UPDATE ai_session_meta SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE session_id = $1 AND tenant_id = $2 AND user_id = $3`,
          [sessionId, scope.tenantId, scope.userId],
        );
      } catch (error) {
        console.error('[ai] 标记会话元数据删除失败:', error);
      }
    },

    async appendMessage(sessionId, scope, message): Promise<void> {
      await memory.appendMessage(sessionId, scope, message);
    },

    async getHistory(
      sessionId,
      scope,
      limit,
    ): Promise<Array<{ role: string; content: string; model?: string; reasoning?: string }>> {
      return memory.getHistory(sessionId, scope, limit ?? 50);
    },

    async getSettings<T = SessionSettings>(
      sessionId: string,
      scope: MemoryScope,
    ): Promise<T | null> {
      const meta = await getMeta(sessionId, scope);
      if (!meta) return null;
      return normalizeSettings(meta.settings) as T;
    },

    async updateSettings(
      sessionId: string,
      scope: MemoryScope,
      patch: Partial<SessionSettings>,
    ): Promise<SessionSettings> {
      if (!db) return patch as SessionSettings;
      const meta = await getMeta(sessionId, scope);
      const next = mergeSettings(meta ? normalizeSettings(meta.settings) : {}, patch);
      const rows = (await db.raw(
        `UPDATE ai_session_meta
            SET settings = $4::jsonb, updated_at = CURRENT_TIMESTAMP
          WHERE session_id = $1 AND tenant_id = $2 AND user_id = $3
          RETURNING session_id`,
        [sessionId, scope.tenantId, scope.userId, JSON.stringify(next)],
      )) as Array<{ session_id: string }>;
      // meta 行不存在（历史会话或写失败）：补建一行再写，避免设置静默丢失
      if (rows.length === 0) {
        const session = await memory.getSession(sessionId, scope);
        if (session) {
          await safeUpsertMeta({
            sessionId,
            tenantId: scope.tenantId,
            userId: scope.userId,
            agentId: session.agentId,
            origin: { kind: 'web' },
          });
          await db.raw(
            `UPDATE ai_session_meta SET settings = $4::jsonb, updated_at = CURRENT_TIMESTAMP
              WHERE session_id = $1 AND tenant_id = $2 AND user_id = $3`,
            [sessionId, scope.tenantId, scope.userId, JSON.stringify(next)],
          );
        }
      }
      return next;
    },

    async backfill(scope?: MemoryScope): Promise<{ scanned: number; filled: number }> {
      if (!db || !scope) return { scanned: 0, filled: 0 };
      const sessions = await memory.listSessions({
        tenantId: scope.tenantId,
        userId: scope.userId,
      });
      if (sessions.length === 0) return { scanned: 0, filled: 0 };

      const ids = sessions.map((s) => s.sessionId);
      const placeholders = ids.map((_, i) => `$${i + 3}`).join(', ');
      const rows = (await db.raw(
        `SELECT session_id FROM ai_session_meta
          WHERE tenant_id = $1 AND user_id = $2 AND session_id IN (${placeholders})`,
        [scope.tenantId, scope.userId, ...ids],
      )) as Array<{ session_id: string }>;
      const existing = new Set(rows.map((r) => r.session_id));
      let filled = 0;
      for (const session of sessions) {
        if (existing.has(session.sessionId)) continue;
        await safeUpsertMeta({
          sessionId: session.sessionId,
          tenantId: session.tenantId,
          userId: session.userId,
          agentId: session.agentId,
          origin: { kind: 'web' },
        });
        filled += 1;
      }
      return { scanned: sessions.length, filled };
    },
  };
}

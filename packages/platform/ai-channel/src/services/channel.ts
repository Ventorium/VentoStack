/**
 * 渠道 CRUD + 凭证加解密
 *
 * 凭证存储约定：
 *   - secrets 列存 `encryptor.encrypt(JSON.stringify({...}))` 的密文
 *   - 接口只回 hasSecret，绝不回明文；PATCH 时缺省/空串表示「不修改」
 *
 * 启停不在这里：enable/disable 需要拉起/断开连接（runtime），
 * 由 module 层组合「改库 + reload」，避免 service 之间互相依赖。
 */

import type { ConfigEncryptor } from '@ventostack/core';
import type { Database } from '@ventostack/database';
import {
  CHANNEL_CATALOG,
  defaultConfig,
  getCatalogEntry,
  isChannelType,
  requiredFields,
} from '../catalog';
import type { ChannelCatalogEntry } from '../catalog';
import { createChannelDao } from '../models/channel';
import type { ChannelDao } from '../models/channel';
import {
  ChannelError,
  type ChannelRow,
  type ChannelRuntimeConfig,
  type ChannelStatus,
} from '../types';

export interface ChannelScope {
  tenantId: string;
  userId: string;
}

/** 前端可见的渠道视图（不含任何凭证明文） */
export interface ChannelPublic {
  id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  hasSecret: boolean;
  /** 已配置的凭证字段名（只给键名，让前端显示「已配置」） */
  secretKeys: string[];
  agentId: string | null;
  enabled: boolean;
  status: ChannelStatus;
  statusDetail: string | null;
  /** webhook 模式下要回填给平台的地址 */
  webhookUrl: string | null;
  /** 扫码类渠道的登录入口是二维码，不是 URL */
  requiresLogin: boolean;
  requiresPublicUrl: boolean;
  transport: ChannelCatalogEntry['transport'];
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateChannelParams extends ChannelScope {
  type: string;
  name?: string;
  config?: Record<string, unknown>;
  secrets?: Record<string, string>;
  agentId?: string | null;
}

export interface UpdateChannelParams {
  name?: string;
  config?: Record<string, unknown>;
  secrets?: Record<string, string>;
  agentId?: string | null;
}

export interface ChannelService {
  list(scope: ChannelScope): Promise<ChannelPublic[]>;
  /** 所有已启用渠道（runtime 启动用，跨用户，仅返回最小标识） */
  listAllEnabled(): Promise<Array<{ id: string; type: string }>>;
  get(id: string, scope: ChannelScope): Promise<ChannelPublic | null>;
  create(params: CreateChannelParams): Promise<ChannelPublic>;
  update(id: string, scope: ChannelScope, params: UpdateChannelParams): Promise<ChannelPublic>;
  remove(id: string, scope: ChannelScope): Promise<void>;
  /** 校验通过后置为待连接/待扫码，实际连接由 runtime 完成 */
  markEnabled(id: string, scope: ChannelScope): Promise<ChannelPublic>;
  disable(id: string, scope: ChannelScope): Promise<ChannelPublic>;

  /** 解密后的运行时配置（adapter 用） */
  getRuntimeConfig(id: string, scope?: ChannelScope): Promise<ChannelRuntimeConfig | null>;
  /** 内部维护运行态（游标/票据） */
  patchRuntimeState(id: string, patch: Record<string, unknown>): Promise<void>;
  setStatus(id: string, status: ChannelStatus, detail?: string | null): Promise<void>;
}

/** JSONB 列可能返回字符串或对象，统一成对象 */
function asObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

/** 只保留目录里声明过的字段，忽略客户端多传的键（防原型污染与脏数据） */
function pickDeclared(
  source: Record<string, unknown> | undefined,
  fields: Array<{ key: string }>,
): Record<string, unknown> {
  if (!source) return {};
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(source, field.key)) {
      const value = source[field.key];
      if (value !== undefined) out[field.key] = value;
    }
  }
  return out;
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

export function createChannelService(deps: {
  db: Database;
  encryptor: ConfigEncryptor;
  publicBaseUrl?: string;
}): ChannelService {
  const { db, encryptor, publicBaseUrl } = deps;
  const dao: ChannelDao = createChannelDao({ db });

  async function encryptSecrets(secrets: Record<string, string>): Promise<string | null> {
    const entries = Object.entries(secrets).filter(([, value]) => !isEmpty(value));
    if (entries.length === 0) return null;
    return encryptor.encrypt(JSON.stringify(Object.fromEntries(entries)));
  }

  async function decryptSecrets(raw: string | null): Promise<Record<string, string>> {
    if (!raw) return {};
    try {
      const plain = await encryptor.decrypt(raw);
      const parsed: unknown = JSON.parse(plain);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === 'string') out[key] = value;
      }
      return out;
    } catch {
      // 密钥轮换或历史脏数据：按「未配置」处理，让用户重新填，而不是 500
      return {};
    }
  }

  function toPublic(row: ChannelRow): ChannelPublic {
    const entry = getCatalogEntry(row.type);
    return {
      id: row.id,
      type: row.type,
      name: row.name,
      config: asObject(row.config),
      hasSecret: Boolean(row.secrets),
      secretKeys: [],
      agentId: row.agent_id,
      enabled: row.enabled,
      status: row.status as ChannelStatus,
      statusDetail: row.status_detail,
      webhookUrl:
        entry && entry.transport === 'webhook' && publicBaseUrl
          ? `${publicBaseUrl.replace(/\/$/, '')}/api/ai/channels/inbound/${row.id}`
          : null,
      requiresLogin: entry?.requiresLogin === true,
      requiresPublicUrl: entry?.requiresPublicUrl === true,
      transport: entry?.transport ?? 'webhook',
      lastActiveAt: row.last_active_at ? row.last_active_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  /** 凭证键名无法从密文反推，只能回「已配置 / 未配置」；前端按目录渲染 */
  async function toPublicWithSecretKeys(row: ChannelRow): Promise<ChannelPublic> {
    const view = toPublic(row);
    const secrets = await decryptSecrets(row.secrets);
    return { ...view, secretKeys: Object.keys(secrets) };
  }

  function validateRequired(
    entry: ChannelCatalogEntry,
    config: Record<string, unknown>,
    secrets: Record<string, string>,
    /** PATCH 场景：已存在的非空凭证视为已配置 */
    existingSecrets: Record<string, string> = {},
  ): void {
    const required = requiredFields(entry.type);
    for (const key of required.config) {
      if (isEmpty(config[key])) {
        const field = entry.configFields.find((f) => f.key === key);
        throw new ChannelError(`请填写「${field?.label ?? key}」`, 'missing_field', 400);
      }
    }
    for (const key of required.secrets) {
      if (isEmpty(secrets[key]) && isEmpty(existingSecrets[key])) {
        const field = entry.secretFields.find((f) => f.key === key);
        throw new ChannelError(`请填写「${field?.label ?? key}」`, 'missing_field', 400);
      }
    }
  }

  return {
    async list(scope: ChannelScope): Promise<ChannelPublic[]> {
      const rows = await dao.list(scope.tenantId, scope.userId);
      return Promise.all(rows.map((row) => toPublicWithSecretKeys(row)));
    },

    async listAllEnabled(): Promise<Array<{ id: string; type: string }>> {
      const rows = await dao.listEnabled();
      return rows.map((row) => ({ id: row.id, type: row.type }));
    },

    async get(id: string, scope: ChannelScope): Promise<ChannelPublic | null> {
      const row = await dao.getById(id, scope.tenantId, scope.userId);
      return row ? toPublicWithSecretKeys(row) : null;
    },

    async create(params: CreateChannelParams): Promise<ChannelPublic> {
      if (!isChannelType(params.type)) {
        throw new ChannelError('不支持的渠道类型', 'invalid_type', 400);
      }
      const entry = getCatalogEntry(params.type)!;
      const config = {
        ...defaultConfig(params.type),
        ...pickDeclared(params.config, entry.configFields),
      };
      const secrets = pickDeclared(params.secrets, entry.secretFields) as Record<string, string>;
      validateRequired(entry, config, secrets);

      const id = crypto.randomUUID();
      const name = (params.name ?? '').trim() || defaultName(entry);
      await dao.create({
        id,
        tenantId: params.tenantId,
        userId: params.userId,
        type: entry.type,
        name,
        config,
        secrets: await encryptSecrets(secrets),
        agentId: params.agentId ?? null,
        enabled: false,
        status: entry.requiresLogin ? 'pending_login' : 'inactive',
      });
      const row = await dao.getById(id, params.tenantId, params.userId);
      if (!row) throw new ChannelError('创建渠道失败', 'create_failed', 500);
      return toPublicWithSecretKeys(row);
    },

    async update(
      id: string,
      scope: ChannelScope,
      params: UpdateChannelParams,
    ): Promise<ChannelPublic> {
      const row = await dao.getById(id, scope.tenantId, scope.userId);
      if (!row) throw new ChannelError('渠道不存在', 'not_found', 404);
      const entry = getCatalogEntry(row.type);
      if (!entry) throw new ChannelError('渠道类型无效', 'invalid_type', 400);

      const existingConfig = asObject(row.config);
      const existingSecrets = await decryptSecrets(row.secrets);

      const nextConfig =
        params.config === undefined
          ? undefined
          : { ...existingConfig, ...pickDeclared(params.config, entry.configFields) };

      let nextSecrets: string | null | undefined;
      if (params.secrets !== undefined) {
        const incoming = pickDeclared(params.secrets, entry.secretFields) as Record<string, string>;
        // 空值 = 不修改（前端不回显明文，留空是常态）
        const merged: Record<string, string> = { ...existingSecrets };
        for (const [key, value] of Object.entries(incoming)) {
          if (!isEmpty(value)) merged[key] = value;
        }
        nextSecrets = await encryptSecrets(merged);
      }

      if (nextConfig !== undefined) {
        // PATCH 场景：凭证字段不回显，只需确认真实已配置的仍在
        validateRequired(entry, nextConfig, {}, existingSecrets);
      }

      const ok = await dao.update(id, scope.tenantId, scope.userId, {
        ...(params.name !== undefined ? { name: params.name.trim() } : {}),
        ...(nextConfig !== undefined ? { config: nextConfig } : {}),
        ...(nextSecrets !== undefined ? { secrets: nextSecrets } : {}),
        ...(params.agentId !== undefined ? { agentId: params.agentId } : {}),
      });
      if (!ok) throw new ChannelError('渠道不存在', 'not_found', 404);

      const updated = await dao.getById(id, scope.tenantId, scope.userId);
      if (!updated) throw new ChannelError('渠道不存在', 'not_found', 404);
      return toPublicWithSecretKeys(updated);
    },

    async remove(id: string, scope: ChannelScope): Promise<void> {
      const ok = await dao.remove(id, scope.tenantId, scope.userId);
      if (!ok) throw new ChannelError('渠道不存在', 'not_found', 404);
      // identity / channel_session 由外键 ON DELETE CASCADE 清理；
      // 记录表刻意没有外键（高频写入），所以必须显式清理：
      // 否则会留下孤儿行，出站队列还会反复重试已删渠道的待发消息
      await db.raw('DELETE FROM ai_channel_message WHERE channel_id = $1 AND tenant_id = $2', [
        id,
        scope.tenantId,
      ]);
      // AI 会话本体不删（用户可能还在 Web 端继续用）
    },

    async markEnabled(id: string, scope: ChannelScope): Promise<ChannelPublic> {
      const row = await dao.getById(id, scope.tenantId, scope.userId);
      if (!row) throw new ChannelError('渠道不存在', 'not_found', 404);
      const entry = getCatalogEntry(row.type);
      if (!entry) throw new ChannelError('渠道类型无效', 'invalid_type', 400);

      const secrets = await decryptSecrets(row.secrets);
      validateRequired(entry, asObject(row.config), secrets, secrets);

      // 扫码类渠道没有 token 时保持 pending_login，等扫码完成
      const needsLogin = entry.requiresLogin === true && isEmpty(secrets.botToken);
      await dao.update(id, scope.tenantId, scope.userId, {
        enabled: true,
        status: needsLogin ? 'pending_login' : 'connecting',
        statusDetail: needsLogin ? '等待扫码登录' : null,
      });
      const updated = await dao.getById(id, scope.tenantId, scope.userId);
      return toPublicWithSecretKeys(updated!);
    },

    async disable(id: string, scope: ChannelScope): Promise<ChannelPublic> {
      const ok = await dao.update(id, scope.tenantId, scope.userId, {
        enabled: false,
        status: 'inactive',
        statusDetail: null,
      });
      if (!ok) throw new ChannelError('渠道不存在', 'not_found', 404);
      const updated = await dao.getById(id, scope.tenantId, scope.userId);
      return toPublicWithSecretKeys(updated!);
    },

    async getRuntimeConfig(id: string, scope?: ChannelScope): Promise<ChannelRuntimeConfig | null> {
      const row = scope
        ? await dao.getById(id, scope.tenantId, scope.userId)
        : await dao.getByIdUnscoped(id);
      if (!row) return null;
      if (scope === undefined && !row.enabled) return null;
      const entry = getCatalogEntry(row.type);
      if (!entry) return null;
      return {
        id: row.id,
        tenantId: row.tenant_id,
        userId: row.user_id,
        type: entry.type,
        name: row.name,
        config: asObject(row.config),
        secrets: await decryptSecrets(row.secrets),
        runtimeState: asObject(row.runtime_state),
        ...(row.agent_id ? { agentId: row.agent_id } : {}),
      };
    },

    async patchRuntimeState(id: string, patch: Record<string, unknown>): Promise<void> {
      await dao.patchRuntimeState(id, patch);
    },

    async setStatus(id: string, status: ChannelStatus, detail?: string | null): Promise<void> {
      await dao.setStatus(id, status, detail ?? null);
    },
  };
}

/** 默认渠道名：同类型多个实例时前端可改，这里只给一个可读起点 */
function defaultName(entry: ChannelCatalogEntry): string {
  return `我的${entry.name}`;
}

/** 供路由做「类型 → 目录」映射（前端 catalog 接口也复用） */
export function catalogList(): readonly ChannelCatalogEntry[] {
  return CHANNEL_CATALOG;
}

/**
 * @ventostack/system - 系统配置服务
 * 提供系统配置的 CRUD、按 key 查值（带缓存）与缓存刷新
 */

import type { Cache } from "@ventostack/cache";
import type { Database } from "@ventostack/database";
import { ConfigModel } from "../models/config";
import { createCacheKeyNamespace } from "./cache-key";
import type { CacheKeyNamespace } from "./cache-key";

/** 分页查询结果 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 系统配置创建参数 */
export interface CreateConfigParams {
  name: string;
  key: string;
  value: string;
  type?: number;
  group?: string;
  remark?: string;
}

/** 系统配置更新参数 */
export interface UpdateConfigParams {
  name?: string;
  value?: string;
  type?: number;
  group?: string;
  remark?: string;
}

/** 受保护的系统配置 key — 不允许删除 */
const PROTECTED_KEYS = [
  "sys_dept_enabled",
  "sys_user_init_password",
  "sys_password_min_length",
  "sys_password_complexity",
  "sys_password_expire_days",
  "sys_login_max_attempts",
  "sys_login_lock_minutes",
  "sys_site_name",
  "sys_mfa_enabled",
  "sys_mfa_force",
  "sys_passkey_enabled",
];

/** 系统配置列表项 */
export interface ConfigItem {
  id: string;
  name: string;
  key: string;
  value: string;
  type: number;
  group: string;
  sort: number;
  remark: string;
  createdAt: string;
}

/** 系统配置列表查询参数 */
export interface ConfigListParams {
  page?: number;
  pageSize?: number;
  group?: string;
}

/** 系统配置服务接口 */
export interface ConfigService {
  /** 创建配置 */
  create(params: CreateConfigParams): Promise<{ id: string }>;
  /** 更新配置（按 ID） */
  update(id: string, params: UpdateConfigParams): Promise<void>;
  /** 删除配置 */
  delete(key: string): Promise<void>;
  /** 分页查询配置列表 */
  list(params?: ConfigListParams): Promise<PaginatedResult<ConfigItem>>;
  /** 按 key 获取配置值（带缓存） */
  getValue(key: string): Promise<string | null>;
  /** 刷新配置缓存 */
  refreshCache(key?: string): Promise<void>;
}

/**
 * 创建系统配置服务实例
 * @param deps 依赖注入
 * @returns ConfigService 实例
 */
export function createConfigService(deps: {
  db: Database;
  cache: Cache;
  /** 租户 ID，启用多租户时传入以隔离缓存 */
  tenantId?: string;
}): ConfigService {
  const { db, cache } = deps;
  const ns: CacheKeyNamespace = createCacheKeyNamespace(deps.tenantId);

  function cacheKey(key: string): string {
    return ns.key(`config:${key}`);
  }

  async function create(params: CreateConfigParams): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    await db.query(ConfigModel).insert({
      id,
      name: params.name,
      key: params.key,
      value: params.value,
      type: params.type ?? null,
      group: params.group ?? null,
      remark: params.remark ?? null,
    });
    return { id };
  }

  async function update(id: string, params: UpdateConfigParams): Promise<void> {
    // 先通过 ID 查出 key，用于缓存清理（与 deleteConfig 同一模式）
    const row = await db.query(ConfigModel).where("id", "=", id).select("key").get();
    if (!row) throw new Error("Config not found");
    const configKey = row.key as string;

    const updates: Record<string, unknown> = {};
    if (params.name !== undefined) updates.name = params.name;
    if (params.value !== undefined) updates.value = params.value;
    if (params.type !== undefined) updates.type = params.type;
    if (params.group !== undefined) updates.group = params.group;
    if (params.remark !== undefined) updates.remark = params.remark;

    if (Object.keys(updates).length === 0) return;

    await db.query(ConfigModel).where("id", "=", id).update(updates);
    await cache.del(cacheKey(configKey));
  }

  async function deleteConfig(id: string): Promise<void> {
    // 先查出 key，用于缓存清理和保护检查
    const row = await db.query(ConfigModel).where("id", "=", id).select("key").get();
    if (!row) return;
    const key = row.key as string;
    if (PROTECTED_KEYS.includes(key)) {
      throw new Error(`系统内置参数 ${key} 不允许删除`);
    }
    await db.query(ConfigModel).where("id", "=", id).delete();
    await cache.del(cacheKey(key));
  }

  async function list(params?: ConfigListParams): Promise<PaginatedResult<ConfigItem>> {
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 10;

    let query = db.query(ConfigModel);
    if (params?.group !== undefined) {
      query = query.where("group", "=", params.group);
    }

    const total = await query.count();

    const rows = await query
      .orderBy("sort", "desc")
      .orderBy("created_at", "desc")
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .list();

    const items: ConfigItem[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      key: row.key,
      value: row.value ?? "",
      type: row.type ?? 0,
      group: row.group ?? "",
      sort: row.sort ?? 0,
      remark: row.remark ?? "",
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at ?? ""),
    }));

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
    };
  }

  async function getValue(key: string): Promise<string | null> {
    return cache.remember<string | null>(cacheKey(key), 3600, async () => {
      const row = await db.query(ConfigModel).where("key", "=", key).select("value").get();
      if (!row) return null;
      return row.value as string;
    });
  }

  async function refreshCache(key?: string): Promise<void> {
    if (key) {
      await cache.del(cacheKey(key));
    } else {
      const adapter = (cache as unknown as { keys?: (pattern: string) => Promise<string[]> }).keys;
      if (adapter && typeof adapter === "function") {
        const allKeys = await adapter("config:*");
        for (const k of allKeys) {
          await cache.del(k);
        }
      }
    }
  }

  return { create, update, delete: deleteConfig, list, getValue, refreshCache };
}

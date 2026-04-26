/**
 * @ventostack/system - 系统配置服务
 * 提供系统配置的 CRUD、按 key 查值（带缓存）与缓存刷新
 */

import type { SqlExecutor } from "@ventostack/database";
import type { Cache } from "@ventostack/cache";

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

/** 系统配置列表项 */
export interface ConfigItem {
  id: string;
  name: string;
  key: string;
  value: string;
  type: number;
  group: string;
  remark: string;
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
  /** 更新配置 */
  update(key: string, params: UpdateConfigParams): Promise<void>;
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
export function createConfigService(deps: { executor: SqlExecutor; cache: Cache }): ConfigService {
  const { executor, cache } = deps;

  function cacheKey(key: string): string {
    return `config:${key}`;
  }

  async function create(params: CreateConfigParams): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    await executor(
      `INSERT INTO sys_config (id, name, key, value, type, "group", remark) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        params.name,
        params.key,
        params.value,
        params.type ?? null,
        params.group ?? null,
        params.remark ?? null,
      ],
    );
    return { id };
  }

  async function update(key: string, params: UpdateConfigParams): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params.name !== undefined) {
      sets.push(`name = $${idx++}`);
      values.push(params.name);
    }
    if (params.value !== undefined) {
      sets.push(`value = $${idx++}`);
      values.push(params.value);
    }
    if (params.type !== undefined) {
      sets.push(`type = $${idx++}`);
      values.push(params.type);
    }
    if (params.group !== undefined) {
      sets.push(`"group" = $${idx++}`);
      values.push(params.group);
    }
    if (params.remark !== undefined) {
      sets.push(`remark = $${idx++}`);
      values.push(params.remark);
    }

    if (sets.length === 0) return;

    values.push(key);
    await executor(
      `UPDATE sys_config SET ${sets.join(", ")} WHERE key = $${idx}`,
      values,
    );

    // 更新后刷新缓存
    await cache.del(cacheKey(key));
  }

  async function deleteConfig(key: string): Promise<void> {
    await executor(`DELETE FROM sys_config WHERE key = $1`, [key]);
    await cache.del(cacheKey(key));
  }

  async function list(params?: ConfigListParams): Promise<PaginatedResult<ConfigItem>> {
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 10;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params?.group !== undefined) {
      conditions.push(`"group" = $${idx++}`);
      values.push(params.group);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countRows = await executor(
      `SELECT COUNT(*) AS total FROM sys_config ${where}`,
      values,
    ) as Array<Record<string, unknown>>;
    const total = Number(countRows[0]?.total ?? 0);

    const rows = await executor(
      `SELECT id, name, key, value, type, COALESCE("group", '') AS "group", COALESCE(remark, '') AS remark FROM sys_config ${where} ORDER BY id ASC LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, pageSize, offset],
    ) as Array<Record<string, unknown>>;

    const items: ConfigItem[] = rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      key: row.key as string,
      value: (row.value as string) ?? "",
      type: (row.type as number) ?? 0,
      group: (row.group as string) ?? "",
      remark: (row.remark as string) ?? "",
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
      const rows = await executor(
        `SELECT value FROM sys_config WHERE key = $1`,
        [key],
      ) as Array<Record<string, unknown>>;
      if (rows.length === 0) return null;
      return rows[0]!.value as string;
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

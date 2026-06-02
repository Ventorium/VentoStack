/**
 * @ventostack/system - 缓存键命名空间工具
 *
 * 为缓存键提供统一的租户命名空间前缀支持。
 * 当租户启用时，缓存键格式变为 `tenant:${tenantId}:原始键`，
 * 确保多租户场景下缓存数据隔离。
 *
 * 用法：
 * ```typescript
 * const ns = createCacheKeyNamespace(tenantId);
 * const key = ns.key("user:detail:123");
 * // tenantId 存在时: "tenant:acme:user:detail:123"
 * // tenantId 缺失时: "user:detail:123"
 * ```
 */

/** 缓存键命名空间工具接口 */
export interface CacheKeyNamespace {
  /**
   * 为缓存键添加租户前缀
   * @param key 原始缓存键
   * @returns 带租户前缀的缓存键
   */
  key(key: string): string;

  /**
   * 生成带租户前缀的列表缓存键
   * @param prefix 键前缀（如 "user:list"）
   * @returns 带租户前缀的缓存键
   */
  listKey(prefix: string): string;

  /**
   * 生成带租户前缀的详情缓存键
   * @param prefix 键前缀（如 "user:detail"）
   * @param id 实体 ID
   * @returns 带租户前缀的缓存键
   */
  detailKey(prefix: string, id: string): string;
}

/**
 * 创建缓存键命名空间工具
 * @param tenantId 租户 ID，为空或 undefined 时不添加前缀
 * @returns CacheKeyNamespace 实例
 */
export function createCacheKeyNamespace(tenantId?: string): CacheKeyNamespace {
  const prefix = tenantId ? `tenant:${tenantId}:` : "";

  return {
    key(key: string): string {
      return `${prefix}${key}`;
    },

    listKey(entityPrefix: string): string {
      return `${prefix}${entityPrefix}:list`;
    },

    detailKey(entityPrefix: string, id: string): string {
      return `${prefix}${entityPrefix}:detail:${id}`;
    },
  };
}

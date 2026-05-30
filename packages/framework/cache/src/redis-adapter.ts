/**
 * @ventostack/cache - Redis 缓存适配器
 * 基于 Redis 实现 CacheAdapter 接口，支持 TTL、键前缀与分布式部署
 * 基于 Bun Redis 设计，满足最小接口的其他客户端亦可接入
 */

import type { CacheAdapter } from "./cache";

/**
 * Redis 缓存客户端最小接口
 * 基于 Bun.RedisClient 设计
 */
export interface RedisCacheClientLike {
  /** 获取键值 */
  get(key: string): Promise<string | null>;
  /** 设置键值 */
  set(key: string, value: string): Promise<unknown>;
  /** 设置键的过期时间（秒），返回是否设置成功 */
  expire(key: string, seconds: number): Promise<number>;
  /** 删除键 */
  del(key: string): Promise<number>;
  /** 判断键是否存在 */
  exists(key: string): Promise<boolean>;
  /** 按模式匹配键 */
  keys(pattern: string): Promise<string[]>;
  /** 发送原始 Redis 命令，用于 FLUSHDB 等非标准方法 */
  send(command: string, args: string[]): Promise<unknown>;
}

/** Redis 适配器选项 */
export interface RedisAdapterOptions {
  /** Redis 客户端实例 */
  client: RedisCacheClientLike;
  /** 键前缀，默认 "" */
  keyPrefix?: string;
}

/**
 * 创建 Redis 缓存适配器
 * @param options 适配器选项
 * @returns CacheAdapter 实例
 *
 * @example
 * ```typescript
 * import { createCache, createRedisAdapter } from "@ventostack/cache";
 * import { RedisClient } from "bun";
 *
 * const redis = new RedisClient("redis://localhost:6379");
 * const cache = createCache(createRedisAdapter({ client: redis, keyPrefix: "app:" }));
 * ```
 */
export function createRedisAdapter(options: RedisAdapterOptions): CacheAdapter {
  const { client, keyPrefix = "" } = options;

  function prefixed(key: string): string {
    return `${keyPrefix}${key}`;
  }

  async function get(key: string): Promise<string | null> {
    return client.get(prefixed(key));
  }

  async function set(key: string, value: string, ttl?: number): Promise<void> {
    const p = prefixed(key);
    await client.set(p, value);
    if (ttl != null && ttl > 0) {
      await client.expire(p, ttl);
    }
  }

  async function del(key: string): Promise<void> {
    await client.del(prefixed(key));
  }

  async function has(key: string): Promise<boolean> {
    return client.exists(prefixed(key));
  }

  async function flush(): Promise<void> {
    await client.send("FLUSHDB", []);
  }

  async function keys(pattern: string): Promise<string[]> {
    const result = await client.keys(prefixed(pattern));
    // 去除前缀，返回原始键名
    if (!keyPrefix) return result;
    return result.filter((k) => k.startsWith(keyPrefix)).map((k) => k.slice(keyPrefix.length));
  }

  return { get, set, del, has, flush, keys };
}

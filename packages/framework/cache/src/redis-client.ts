/**
 * @ventostack/cache - Redis 客户端工厂
 * 封装 Bun 原生 RedisClient，提供统一的创建与关闭接口
 */

import type { RedisCacheClientLike } from "./redis-adapter";

/**
 * Redis 客户端工厂选项
 */
export interface RedisClientOptions {
  /** Redis 连接 URL（如 "redis://localhost:6379"） */
  url: string;
}

/**
 * Redis 客户端实例，扩展了 RedisCacheClientLike 并添加 close 方法
 */
export interface RedisClientInstance extends RedisCacheClientLike {
  /** 递增键值 */
  incr(key: string): Promise<number>;
  /** 设置键的过期时间（毫秒） */
  pexpire(key: string, milliseconds: number): Promise<number>;
  /** 获取键剩余过期时间（毫秒） */
  pttl(key: string): Promise<number>;
  /** 关闭 Redis 连接 */
  close(): Promise<void>;
}

/**
 * 创建 Redis 客户端
 * 封装 Bun 原生 RedisClient，实现 RedisCacheClientLike 接口
 *
 * @param options - 连接选项
 * @returns Redis 客户端实例
 *
 * @example
 * ```typescript
 * import { createRedisClient, createCache, createRedisAdapter } from "@ventostack/cache";
 *
 * const redis = createRedisClient({ url: "redis://localhost:6379" });
 * const cache = createCache(createRedisAdapter({ client: redis, keyPrefix: "app:" }));
 *
 * // 使用完毕后关闭
 * await redis.close();
 * ```
 */
export function createRedisClient(options: RedisClientOptions): RedisClientInstance {
  // @ts-ignore - Bun.RedisClient is only available in Bun runtime
  const BunRedisClient = (globalThis as any).Bun?.RedisClient ?? (globalThis as any).RedisClient;

  if (typeof BunRedisClient !== "function") {
    throw new Error(
      "Bun.RedisClient is not available. Please run in Bun 1.2+ runtime.",
    );
  }

  const client = new BunRedisClient(options.url);

  return {
    async get(key: string) {
      return client.get(key);
    },
    async set(key: string, value: string) {
      return client.set(key, value);
    },
    async expire(key: string, seconds: number) {
      return client.expire(key, seconds);
    },
    async incr(key: string) {
      const result = await client.send("INCR", [key]);
      return Number(result);
    },
    async pexpire(key: string, milliseconds: number) {
      const result = await client.send("PEXPIRE", [key, String(milliseconds)]);
      return Number(result);
    },
    async pttl(key: string) {
      const result = await client.send("PTTL", [key]);
      return Number(result);
    },
    async del(key: string) {
      return client.del(key);
    },
    async exists(key: string) {
      return client.exists(key);
    },
    async keys(pattern: string) {
      return client.keys(pattern);
    },
    async send(command: string, args: string[]) {
      return client.send(command, args);
    },
    async close() {
      await client.send("QUIT", []);
    },
  };
}

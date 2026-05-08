/**
 * 缓存层初始化
 *
 * 使用 @ventostack/cache 的 createRedisClient 创建 Redis 连接
 */

import { createTagLogger } from "@ventostack/core";
import { createCache, createMemoryAdapter, createRedisAdapter, createRedisClient } from "@ventostack/cache";
import type { Cache, RedisClientInstance } from "@ventostack/cache";
import { env } from "../config";

const log = createTagLogger("cache");

export type { Cache };

export interface CacheInstance {
  cache: Cache;
  /** Redis 客户端引用（仅 redis 驱动时存在，用于健康检查） */
  redisClient?: RedisClientInstance;
  /** 优雅关闭连接 */
  close(): Promise<void>;
}

/**
 * 创建缓存实例
 * 支持 memory（开发/测试）和 redis（生产）两种驱动
 */
export async function createCacheInstance(): Promise<CacheInstance> {
  switch (env.CACHE_DRIVER) {
    case "redis": {
      const redisUrl = env.REDIS_URL ?? "redis://localhost:6379";
      const client = createRedisClient({ url: redisUrl });
      const cache = createCache(createRedisAdapter({ client, keyPrefix: "admin:" }));
      log.info(`Using Redis adapter (${redisUrl})`);
      return {
        cache,
        redisClient: client,
        close: () => client.close(),
      };
    }
    case "memory":
    default: {
      log.info("Using memory adapter");
      return {
        cache: createCache(createMemoryAdapter()),
        close: async () => {},
      };
    }
  }
}

/**
 * 缓存层初始化
 */

import { createCache, createMemoryAdapter } from "@ventostack/cache";
import type { Cache } from "@ventostack/cache";
import { env } from "../config";

export type { Cache };

/**
 * 创建缓存实例
 * 支持 memory（开发/测试）和 redis（生产）两种驱动
 */
export function createCacheInstance(): Cache {
  switch (env.CACHE_DRIVER) {
    case "redis": {
      // 动态加载 Redis 适配器，避免不需要时的依赖
      // const { createRedisAdapter } = await import("@ventostack/cache");
      // const redis = Bun.env.REDIS_URL ? /* connect */ : undefined;
      // return createCache(createRedisAdapter({ client: redis! }));
      console.warn("[cache] Redis driver not yet implemented, falling back to memory");
      return createCache(createMemoryAdapter());
    }
    case "memory":
    default: {
      console.log("[cache] Using memory adapter");
      return createCache(createMemoryAdapter());
    }
  }
}

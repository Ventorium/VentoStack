/**
 * @ventostack/auth - Redis Session 存储
 * 基于 Redis 实现 SessionStore 接口，支持 TTL 自动过期与分布式部署
 * 基于 Bun Redis 设计
 */

import type { Session, SessionStore } from "./session";

/**
 * Redis Session 存储客户端最小接口
 * 基于 Bun Redis 设计
 */
export interface RedisSessionClientLike {
  /** 获取键值 */
  get(key: string): Promise<string | null>;
  /** 设置键值 */
  set(key: string, value: string): Promise<unknown>;
  /** 设置键的过期时间（秒） */
  expire(key: string, seconds: number): Promise<number>;
  /** 删除键 */
  del(key: string): Promise<number>;
}

/** Redis Session 存储选项 */
export interface RedisSessionStoreOptions {
  /** Redis 客户端实例 */
  client: RedisSessionClientLike;
  /** 键前缀，默认 "session:" */
  keyPrefix?: string;
}

/**
 * 创建 Redis Session 存储实例
 * @param options 存储选项
 * @returns SessionStore 实例
 *
 * @example
 * ```typescript
 * import { createSessionManager, createRedisSessionStore } from "@ventostack/auth";
 *
 * const redis = new Bun.Redis("redis://localhost:6379");
 * const store = createRedisSessionStore({ client: redis, keyPrefix: "app:session:" });
 * const session = createSessionManager(store, { ttl: 3600 });
 * ```
 */
export function createRedisSessionStore(options: RedisSessionStoreOptions): SessionStore {
  const { client, keyPrefix = "session:" } = options;

  function prefixed(id: string): string {
    return `${keyPrefix}${id}`;
  }

  return {
    async get(id: string): Promise<Session | null> {
      const data = await client.get(prefixed(id));
      if (!data) return null;
      try {
        return JSON.parse(data) as Session;
      } catch {
        return null;
      }
    },

    async set(session: Session): Promise<void> {
      const key = prefixed(session.id);
      const ttlSeconds = Math.ceil((session.expiresAt - Date.now()) / 1000);
      if (ttlSeconds <= 0) {
        await client.del(key);
        return;
      }
      await client.set(key, JSON.stringify(session));
      await client.expire(key, ttlSeconds);
    },

    async delete(id: string): Promise<void> {
      await client.del(prefixed(id));
    },

    async touch(id: string, ttl: number): Promise<void> {
      await client.expire(prefixed(id), ttl);
    },
  };
}

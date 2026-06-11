/**
 * SSE 连接数限制器
 * per-user 并发连接数上限，防止资源耗尽
 * 实现：基于 Cache 的计数器（INCR/DECR）
 */
import type { Cache } from "@ventostack/cache";

export interface ConnectionLimiter {
  /** 尝试获取连接槽，超限返回 false */
  acquire(userId: string): Promise<boolean>;
  /** 释放连接槽，必须在连接断开时调用 */
  release(userId: string): Promise<void>;
}

const SSE_CONN_PREFIX = "ai:sse:";
const DEFAULT_MAX_PER_USER = 5;

export function createConnectionLimiter(deps: {
  cache: Cache;
  maxPerUser?: number;
}): ConnectionLimiter {
  const { cache } = deps;
  const maxPerUser = deps.maxPerUser ?? DEFAULT_MAX_PER_USER;

  // 本地计数器 + 远程计数器双保险
  const localCounts = new Map<string, number>();

  function buildKey(userId: string): string {
    return `${SSE_CONN_PREFIX}${userId}`;
  }

  async function acquire(userId: string): Promise<boolean> {
    const key = buildKey(userId);

    // 本地计数快速检查
    const localCount = localCounts.get(userId) ?? 0;
    if (localCount >= maxPerUser) return false;

    // 远程计数检查
    const remoteCount = await cache.get<number>(key) ?? 0;
    if (remoteCount >= maxPerUser) return false;

    // 递增
    const newCount = remoteCount + 1;
    await cache.set(key, newCount, { ttl: 3600 }); // 1 小时过期兜底
    localCounts.set(userId, localCount + 1);

    return true;
  }

  async function release(userId: string): Promise<void> {
    const key = buildKey(userId);

    const localCount = localCounts.get(userId) ?? 0;
    if (localCount > 0) {
      localCounts.set(userId, localCount - 1);
    }

    const remoteCount = await cache.get<number>(key) ?? 0;
    if (remoteCount > 0) {
      await cache.set(key, remoteCount - 1, { ttl: 3600 });
    } else {
      await cache.del(key);
    }
  }

  return { acquire, release };
}

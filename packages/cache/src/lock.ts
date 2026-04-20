// @aeron/cache - 分布式锁

import type { CacheAdapter } from "./cache";

export interface Lock {
  acquired: boolean;
  release(): Promise<void>;
}

export interface LockOptions {
  ttl?: number; // 锁超时（秒），默认 30
  retries?: number; // 重试次数，默认 0
  retryDelay?: number; // 重试间隔（毫秒），默认 200
}

const LOCK_PREFIX = "lock:";

export function createLock(adapter: CacheAdapter) {
  async function tryAcquire(key: string, ttl: number): Promise<boolean> {
    const lockKey = `${LOCK_PREFIX}${key}`;
    const exists = await adapter.has(lockKey);
    if (exists) return false;
    await adapter.set(lockKey, "1", ttl);
    return true;
  }

  async function acquire(key: string, options?: LockOptions): Promise<Lock> {
    const ttl = options?.ttl ?? 30;
    const retries = options?.retries ?? 0;
    const retryDelay = options?.retryDelay ?? 200;
    const lockKey = `${LOCK_PREFIX}${key}`;

    let acquired = await tryAcquire(key, ttl);

    if (!acquired && retries > 0) {
      for (let i = 0; i < retries; i++) {
        await Bun.sleep(retryDelay);
        acquired = await tryAcquire(key, ttl);
        if (acquired) break;
      }
    }

    return {
      acquired,
      async release() {
        if (acquired) {
          await adapter.del(lockKey);
          acquired = false;
        }
      },
    };
  }

  return { acquire };
}

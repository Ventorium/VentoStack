// @aeron/cache - 二级缓存（本地 L1 + 远端 L2）

import type { CacheAdapter } from "./cache";

export interface L2CacheOptions {
  /** L1 默认 TTL（ms） */
  l1TTL?: number;
  /** L1 最大条目数 */
  l1MaxSize?: number;
  /** 是否写穿到 L2 */
  writeThrough?: boolean;
}

export interface L2Cache {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  stats(): { l1Hits: number; l2Hits: number; misses: number; l1Size: number };
}

interface L1Entry {
  value: unknown;
  expiresAt: number;
}

/**
 * 创建二级缓存（本地内存 L1 + 远端 L2）
 * L1 用于热数据快速访问，L2 作为持久化/共享缓存
 */
export function createL2Cache(l2Adapter: CacheAdapter, options?: L2CacheOptions): L2Cache {
  const l1TTL = options?.l1TTL ?? 5000;
  const l1MaxSize = options?.l1MaxSize ?? 1000;
  const writeThrough = options?.writeThrough ?? true;

  const l1 = new Map<string, L1Entry>();
  let l1Hits = 0;
  let l2Hits = 0;
  let misses = 0;

  function evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of l1) {
      if (entry.expiresAt <= now) {
        l1.delete(key);
      }
    }
  }

  function evictLRU(): void {
    if (l1.size <= l1MaxSize) return;
    // 简单 FIFO 驱逐
    const keysToRemove = l1.size - l1MaxSize;
    const iter = l1.keys();
    for (let i = 0; i < keysToRemove; i++) {
      const { value: key } = iter.next();
      if (key) l1.delete(key);
    }
  }

  return {
    async get<T = unknown>(key: string): Promise<T | null> {
      // 查 L1
      const l1Entry = l1.get(key);
      if (l1Entry && l1Entry.expiresAt > Date.now()) {
        l1Hits++;
        return l1Entry.value as T;
      }
      if (l1Entry) l1.delete(key);

      // 查 L2
      const l2Value = await l2Adapter.get(key);
      if (l2Value !== null && l2Value !== undefined) {
        l2Hits++;
        const parsed = typeof l2Value === "string" ? JSON.parse(l2Value) : l2Value;
        // 写回 L1
        l1.set(key, { value: parsed, expiresAt: Date.now() + l1TTL });
        evictLRU();
        return parsed as T;
      }

      misses++;
      return null;
    },

    async set(key: string, value: unknown, ttl?: number): Promise<void> {
      // 写 L1
      l1.set(key, { value, expiresAt: Date.now() + (ttl ?? l1TTL) });
      evictLRU();

      // 写 L2
      if (writeThrough) {
        await l2Adapter.set(key, JSON.stringify(value), ttl);
      }
    },

    async delete(key: string): Promise<void> {
      l1.delete(key);
      await l2Adapter.delete(key);
    },

    async clear(): Promise<void> {
      l1.clear();
      l1Hits = 0;
      l2Hits = 0;
      misses = 0;
    },

    stats(): { l1Hits: number; l2Hits: number; misses: number; l1Size: number } {
      evictExpired();
      return { l1Hits, l2Hits, misses, l1Size: l1.size };
    },
  };
}

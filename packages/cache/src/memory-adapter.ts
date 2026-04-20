// @aeron/cache - 内存缓存适配器

import type { CacheAdapter } from "./cache";

interface CacheEntry {
  value: string;
  expiresAt: number | null; // Unix ms, null = no expiry
}

function matchPattern(pattern: string, key: string): boolean {
  // 将通配符 * 转换为正则
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(key);
}

export function createMemoryAdapter(): CacheAdapter {
  const store = new Map<string, CacheEntry>();

  function isExpired(entry: CacheEntry): boolean {
    return entry.expiresAt !== null && Date.now() >= entry.expiresAt;
  }

  async function get(key: string): Promise<string | null> {
    const entry = store.get(key);
    if (!entry) return null;
    if (isExpired(entry)) {
      store.delete(key);
      return null;
    }
    return entry.value;
  }

  async function set(key: string, value: string, ttl?: number): Promise<void> {
    const expiresAt = ttl != null && ttl > 0 ? Date.now() + ttl * 1000 : null;
    store.set(key, { value, expiresAt });
  }

  async function del(key: string): Promise<void> {
    store.delete(key);
  }

  async function has(key: string): Promise<boolean> {
    const entry = store.get(key);
    if (!entry) return false;
    if (isExpired(entry)) {
      store.delete(key);
      return false;
    }
    return true;
  }

  async function flush(): Promise<void> {
    store.clear();
  }

  async function keys(pattern: string): Promise<string[]> {
    const result: string[] = [];
    for (const [key, entry] of store) {
      if (isExpired(entry)) {
        store.delete(key);
        continue;
      }
      if (matchPattern(pattern, key)) {
        result.push(key);
      }
    }
    return result;
  }

  return { get, set, del, has, flush, keys };
}

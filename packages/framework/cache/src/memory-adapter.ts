/**
 * @ventostack/cache - 内存缓存适配器
 * 基于 Map 实现，支持 TTL 过期、通配符模式匹配与自动清理
 * 适用于单进程场景，作为 Redis 的本地降级或测试替代
 */

import type { CacheAdapter } from "./cache";

/**
 * 内存缓存条目结构
 */
interface CacheEntry {
  /** 缓存值的字符串形式 */
  value: string;
  /** 过期时间戳（Unix 毫秒），null 表示永不过期 */
  expiresAt: number | null;
}

/**
 * 判断缓存键是否匹配通配符模式
 * @param pattern 匹配模式，支持 * 作为通配符
 * @param key 缓存键
 * @returns 匹配返回 true，否则返回 false
 */
function matchPattern(pattern: string, key: string): boolean {
  // 将通配符 * 转换为正则
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(key);
}

/**
 * 创建内存缓存适配器
 * 基于 Map 实现，支持 TTL 过期与模式匹配查询
 * @returns 内存缓存适配器实例
 */
export function createMemoryAdapter(): CacheAdapter {
  const store = new Map<string, CacheEntry>();

  /**
   * 判断缓存条目是否已过期
   * @param entry 缓存条目
   * @returns 已过期返回 true，否则返回 false
   */
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

  async function increment(key: string, ttl?: number): Promise<number> {
    const current = Number.parseInt((await get(key)) ?? "0", 10);
    const next = Number.isFinite(current) ? current + 1 : 1;
    await set(key, String(next), ttl);
    return next;
  }

  return { get, set, del, has, flush, keys, increment };
}

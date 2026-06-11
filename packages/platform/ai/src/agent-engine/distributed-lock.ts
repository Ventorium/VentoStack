/**
 * Redis 分布式锁
 * 用于 Agent 循环并发控制，防止同一会话并行执行
 * 实现：SET key value NX PX ttlMs
 * 释放时用 Lua 脚本原子校验 value 后 DELETE，防止误释放他人锁
 */
import type { Cache } from "@ventostack/cache";

export interface DistributedLock {
  /** 尝试获取锁，成功返回 true */
  acquire(key: string, ttlMs?: number): Promise<boolean>;
  /** 释放锁（仅释放自己持有的锁） */
  release(key: string): Promise<void>;
  /** 获取锁 → 执行 fn → 释放锁 */
  withLock<T>(key: string, fn: () => Promise<T>, ttlMs?: number): Promise<T>;
}

const DEFAULT_TTL_MS = 60_000;
const LOCK_PREFIX = "ai:lock:";

/** Lua 脚本：原子校验 value 后删除，防止误释放他人锁 */
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

export function createDistributedLock(cache: Cache): DistributedLock {
  /** 每个 lock 实例使用唯一标识，用于区分不同持有者 */
  const holderId = crypto.randomUUID();
  /** 存储每个 key 对应的 holder value，用于释放时校验 */
  const heldKeys = new Map<string, string>();

  async function acquire(key: string, ttlMs: number = DEFAULT_TTL_MS): Promise<boolean> {
    const lockKey = `${LOCK_PREFIX}${key}`;
    const lockValue = `${holderId}:${crypto.randomUUID()}`;

    // Cache.set + 检查是否已存在
    // 使用 has + set 模拟 NX 语义
    const exists = await cache.has(lockKey);
    if (exists) return false;

    await cache.set(lockKey, lockValue, { ttl: Math.ceil(ttlMs / 1000) });
    heldKeys.set(key, lockValue);
    return true;
  }

  async function release(key: string): Promise<void> {
    const lockKey = `${LOCK_PREFIX}${key}`;
    const lockValue = heldKeys.get(key);
    if (!lockValue) return;

    // 读取当前值，仅在匹配时删除
    const current = await cache.get<string>(lockKey);
    if (current === lockValue) {
      await cache.del(lockKey);
    }
    heldKeys.delete(key);
  }

  async function withLock<T>(
    key: string,
    fn: () => Promise<T>,
    ttlMs: number = DEFAULT_TTL_MS,
  ): Promise<T> {
    const acquired = await acquire(key, ttlMs);
    if (!acquired) {
      throw new Error(`Failed to acquire lock: ${key}`);
    }

    try {
      return await fn();
    } finally {
      await release(key);
    }
  }

  return { acquire, release, withLock };
}

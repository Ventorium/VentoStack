/**
 * @ventostack/cache - 分布式锁
 * 基于缓存适配器实现互斥锁，支持重试与自动过期释放
 * 适用于分布式环境下的临界区保护，如定时任务、库存扣减等场景
 */

import type { CacheAdapter } from "./cache";

/**
 * 分布式锁实例
 */
export interface Lock {
  /** 是否成功获取锁 */
  acquired: boolean;
  /**
   * 释放锁
   */
  release(): Promise<void>;
}

/**
 * 分布式锁获取选项
 */
export interface LockOptions {
  /** 锁超时时间（秒），默认 30 */
  ttl?: number;
  /** 重试次数，默认 0 */
  retries?: number;
  /** 重试间隔（毫秒），默认 200 */
  retryDelay?: number;
}

/** 锁键前缀 */
const LOCK_PREFIX = "lock:";

/**
 * 创建分布式锁管理器
 * 基于缓存适配器实现互斥锁，支持重试与自动过期释放
 * @param adapter 缓存适配器（如 Redis、内存适配器）
 * @returns 锁管理器，包含 acquire 方法
 */
export function createLock(adapter: CacheAdapter) {
  /**
   * 尝试获取锁
   * @param key 锁标识键
   * @param ttl 锁超时时间（秒）
   * @returns 成功获取返回 true，否则返回 false
   */
  async function tryAcquire(key: string, ttl: number): Promise<boolean> {
    const lockKey = `${LOCK_PREFIX}${key}`;
    // 优先使用原子 SET NX EX（Redis 等支持 NX 的适配器），避免 check-then-set 竞态
    if ("setNX" in adapter && typeof adapter.setNX === "function") {
      return adapter.setNX(lockKey, "1", ttl);
    }
    // 降级：check-then-set（内存/文件等单机适配器可接受）
    const exists = await adapter.has(lockKey);
    if (exists) return false;
    await adapter.set(lockKey, "1", ttl);
    return true;
  }

  /**
   * 获取锁，支持重试机制
   * @param key 锁标识键
   * @param options 锁获取选项
   * @returns 锁实例，包含 acquired 状态与 release 方法
   */
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

// @aeron/cache - 分布式一致性（防 cache stampede）

export interface StampedeProtectionOptions {
  /** 锁超时（ms） */
  lockTimeout?: number;
  /** 等待间隔（ms） */
  waitInterval?: number;
  /** 最大等待次数 */
  maxWaitAttempts?: number;
  /** 提前刷新时间窗口（ms），在 TTL 到期前提前刷新 */
  earlyRefreshWindow?: number;
}

export interface StampedeProtection {
  /**
   * 获取缓存值，防止 stampede
   * 使用互斥锁确保只有一个请求去加载数据，其他请求等待
   */
  getOrLoad<T>(
    key: string,
    loader: () => Promise<T>,
    ttl: number,
  ): Promise<T>;

  /**
   * 概率性提前刷新（XFetch 算法）
   * 在缓存即将过期时，以一定概率提前刷新
   */
  getOrLoadXFetch<T>(
    key: string,
    loader: () => Promise<T>,
    ttl: number,
  ): Promise<T>;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  delta: number; // 上次加载耗时（ms）
}

/**
 * 创建 Stampede 保护器
 */
export function createStampedeProtection(
  getter: (key: string) => Promise<string | null>,
  setter: (key: string, value: string, ttl?: number) => Promise<void>,
  options?: StampedeProtectionOptions,
): StampedeProtection {
  const lockTimeout = options?.lockTimeout ?? 5000;
  const waitInterval = options?.waitInterval ?? 50;
  const maxWaitAttempts = options?.maxWaitAttempts ?? 100;
  const earlyRefreshWindow = options?.earlyRefreshWindow ?? 1000;

  const locks = new Map<string, Promise<unknown>>();

  async function acquireLock(key: string): Promise<boolean> {
    const lockKey = `lock:${key}`;
    if (locks.has(lockKey)) return false;
    locks.set(lockKey, new Promise((resolve) => setTimeout(resolve, lockTimeout)));
    return true;
  }

  function releaseLock(key: string): void {
    locks.delete(`lock:${key}`);
  }

  return {
    async getOrLoad<T>(key: string, loader: () => Promise<T>, ttl: number): Promise<T> {
      // 尝试从缓存获取
      const cached = await getter(key);
      if (cached !== null) {
        try {
          return JSON.parse(cached) as T;
        } catch {
          // 缓存损坏，重新加载
        }
      }

      // 尝试获取锁
      const locked = await acquireLock(key);
      if (locked) {
        try {
          // 双重检查
          const rechecked = await getter(key);
          if (rechecked !== null) {
            try {
              return JSON.parse(rechecked) as T;
            } catch {
              // 继续加载
            }
          }
          const value = await loader();
          await setter(key, JSON.stringify(value), ttl);
          return value;
        } finally {
          releaseLock(key);
        }
      }

      // 等待其他请求完成
      for (let i = 0; i < maxWaitAttempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, waitInterval));
        const result = await getter(key);
        if (result !== null) {
          try {
            return JSON.parse(result) as T;
          } catch {
            continue;
          }
        }
      }

      // 超时，直接加载
      const value = await loader();
      await setter(key, JSON.stringify(value), ttl);
      return value;
    },

    async getOrLoadXFetch<T>(key: string, loader: () => Promise<T>, ttl: number): Promise<T> {
      const metaKey = `meta:${key}`;
      const cached = await getter(metaKey);

      if (cached !== null) {
        try {
          const entry = JSON.parse(cached) as CacheEntry<T>;
          const now = Date.now();
          const remaining = entry.expiresAt - now;

          // XFetch 概率公式：probability = delta * beta * log(random)
          // beta 通常为 1
          if (remaining > 0) {
            const beta = 1;
            const probability = entry.delta * beta * Math.log(Math.random());
            if (remaining + probability > earlyRefreshWindow) {
              return entry.value;
            }
          }
        } catch {
          // 继续重新加载
        }
      }

      const start = performance.now();
      const value = await loader();
      const delta = performance.now() - start;

      const entry: CacheEntry<T> = {
        value,
        expiresAt: Date.now() + ttl,
        delta,
      };
      await setter(metaKey, JSON.stringify(entry), ttl);
      await setter(key, JSON.stringify(value), ttl);

      return value;
    },
  };
}

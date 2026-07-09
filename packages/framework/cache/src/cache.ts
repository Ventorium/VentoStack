/**
 * @ventostack/cache - 统一缓存接口
 * 提供基于 CacheAdapter 的高层缓存能力，包括标签、remember、singleflight 等特性
 * 所有值内部序列化为 JSON，支持 TTL 过期与按标签批量清除
 */

/**
 * 缓存选项配置
 */
export interface CacheOptions {
  /** TTL（秒），缓存过期时间 */
  ttl?: number;
  /** 标签列表，用于按标签批量清除缓存 */
  tags?: string[];
}

/**
 * 缓存适配器接口
 * 定义底层缓存存储（如 Redis、内存、文件等）必须实现的操作契约
 */
export interface CacheAdapter {
  /**
   * 根据键获取缓存值
   * @param key 缓存键
   * @returns 缓存的字符串值，不存在时返回 null
   */
  get(key: string): Promise<string | null>;

  /**
   * 设置缓存值
   * @param key 缓存键
   * @param value 缓存值（字符串）
   * @param ttl 可选的过期时间（秒）
   */
  set(key: string, value: string, ttl?: number): Promise<void>;

  /**
   * 删除指定缓存键
   * @param key 缓存键
   */
  del(key: string): Promise<void>;

  /**
   * 判断缓存键是否存在
   * @param key 缓存键
   * @returns 存在返回 true，否则返回 false
   */
  has(key: string): Promise<boolean>;

  /**
   * 清空所有缓存
   */
  flush(): Promise<void>;

  /**
   * 按模式匹配获取缓存键列表
   * @param pattern 匹配模式，支持通配符 *
   * @returns 匹配的键列表
   */
  keys(pattern: string): Promise<string[]>;

  /**
   * 原子递增数字键，可选首次写入 TTL。
   * 分布式限流等场景应优先使用该方法。
   */
  increment?(key: string, ttl?: number): Promise<number>;
}

/**
 * 带标签的缓存视图接口
 * 通过标签关联一组缓存键，支持按标签批量清除
 */
export interface TaggedCache {
  /**
   * 获取缓存值
   * @param key 缓存键
   * @returns 反序列化后的缓存值，不存在时返回 null
   */
  get<T = unknown>(key: string): Promise<T | null>;

  /**
   * 设置缓存值并自动关联到当前标签
   * @param key 缓存键
   * @param value 缓存值（任意类型，内部会序列化为 JSON）
   * @param options 可选的缓存配置（不含 tags）
   */
  set(key: string, value: unknown, options?: Omit<CacheOptions, "tags">): Promise<void>;

  /**
   * 清除当前标签关联的所有缓存键
   */
  flush(): Promise<void>;
}

/**
 * 统一缓存接口
 * 提供基于 CacheAdapter 的高层缓存能力，包括标签、remember、singleflight 等特性
 */
export interface Cache {
  /**
   * 获取缓存值
   * @param key 缓存键
   * @returns 反序列化后的缓存值，不存在时返回 null
   */
  get<T = unknown>(key: string): Promise<T | null>;

  /**
   * 设置缓存值
   * @param key 缓存键
   * @param value 缓存值（任意类型，内部会序列化为 JSON）
   * @param options 可选的缓存配置（含 TTL 和标签）
   */
  set(key: string, value: unknown, options?: CacheOptions): Promise<void>;

  /**
   * 删除指定缓存键
   * @param key 缓存键
   */
  del(key: string): Promise<void>;

  /**
   * 判断缓存键是否存在
   * @param key 缓存键
   * @returns 存在返回 true，否则返回 false
   */
  has(key: string): Promise<boolean>;

  /**
   * 清空所有缓存
   */
  flush(): Promise<void>;

  /**
   * 获取指定标签的缓存视图
   * @param tags 标签列表
   * @returns 带标签的缓存视图实例
   */
  tags(tags: string[]): TaggedCache;

  /**
   *  remember 模式：先查缓存，未命中则执行工厂函数并将结果写入缓存
   * @param key 缓存键
   * @param ttl 缓存过期时间（秒）
   * @param factory 数据加载工厂函数
   * @returns 缓存值或工厂函数返回值
   */
  remember<T>(key: string, ttl: number, factory: () => Promise<T>): Promise<T>;

  /**
   * singleflight 模式：对同一 key 的并发请求只执行一次工厂函数
   * @param key 缓存键
   * @param factory 数据加载工厂函数
   * @returns 缓存值或工厂函数返回值
   */
  singleflight<T>(key: string, factory: () => Promise<T>): Promise<T>;

  /**
   * 原子递增数字键，可选首次写入 TTL。
   */
  increment(key: string, ttl?: number): Promise<number>;
}

const TAG_PREFIX = "tag:";

/**
 * 创建带标签的缓存视图
 * @param adapter 底层缓存适配器
 * @param tagNames 标签名称列表
 * @returns 带标签的缓存视图实例
 */
function createTaggedCache(adapter: CacheAdapter, tagNames: string[]): TaggedCache {
  async function get<T = unknown>(key: string): Promise<T | null> {
    const raw = await adapter.get(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  }

  async function set(
    key: string,
    value: unknown,
    options?: Omit<CacheOptions, "tags">,
  ): Promise<void> {
    await adapter.set(key, JSON.stringify(value), options?.ttl);
    // 将 key 关联到每个 tag
    for (const tag of tagNames) {
      const tagKey = `${TAG_PREFIX}${tag}`;
      const existing = await adapter.get(tagKey);
      const keys: string[] = existing ? JSON.parse(existing) : [];
      if (!keys.includes(key)) {
        keys.push(key);
        await adapter.set(tagKey, JSON.stringify(keys));
      }
    }
  }

  async function flush(): Promise<void> {
    for (const tag of tagNames) {
      const tagKey = `${TAG_PREFIX}${tag}`;
      const existing = await adapter.get(tagKey);
      if (existing) {
        const keys: string[] = JSON.parse(existing);
        for (const key of keys) {
          await adapter.del(key);
        }
        await adapter.del(tagKey);
      }
    }
  }

  return { get, set, flush };
}

/**
 * 创建统一缓存实例
 * @param adapter 底层缓存适配器
 * @returns 缓存实例
 */
export function createCache(adapter: CacheAdapter): Cache {
  const inflightMap = new Map<string, Promise<unknown>>();

  async function get<T = unknown>(key: string): Promise<T | null> {
    const raw = await adapter.get(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  }

  async function set(key: string, value: unknown, options?: CacheOptions): Promise<void> {
    await adapter.set(key, JSON.stringify(value), options?.ttl);
    if (options?.tags) {
      for (const tag of options.tags) {
        const tagKey = `${TAG_PREFIX}${tag}`;
        const existing = await adapter.get(tagKey);
        const keys: string[] = existing ? JSON.parse(existing) : [];
        if (!keys.includes(key)) {
          keys.push(key);
          await adapter.set(tagKey, JSON.stringify(keys));
        }
      }
    }
  }

  async function del(key: string): Promise<void> {
    await adapter.del(key);
  }

  async function has(key: string): Promise<boolean> {
    return adapter.has(key);
  }

  async function flush(): Promise<void> {
    await adapter.flush();
  }

  async function increment(key: string, ttl?: number): Promise<number> {
    if (adapter.increment) return adapter.increment(key, ttl);
    const current = Number.parseInt((await adapter.get(key)) ?? "0", 10);
    const next = Number.isFinite(current) ? current + 1 : 1;
    await adapter.set(key, String(next), ttl);
    return next;
  }

  function tags(tagNames: string[]): TaggedCache {
    return createTaggedCache(adapter, tagNames);
  }

  async function remember<T>(key: string, ttl: number, factory: () => Promise<T>): Promise<T> {
    const cached = await get<T>(key);
    if (cached !== null) return cached;
    const value = await factory();
    await set(key, value, { ttl });
    return value;
  }

  async function singleflight<T>(key: string, factory: () => Promise<T>): Promise<T> {
    const existing = inflightMap.get(key);
    if (existing) return existing as Promise<T>;

    const promise = factory().finally(() => {
      inflightMap.delete(key);
    });
    inflightMap.set(key, promise);
    return promise;
  }

  return { get, set, del, has, flush, tags, remember, singleflight, increment };
}

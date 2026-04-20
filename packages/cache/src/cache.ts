// @aeron/cache - 统一缓存接口

export interface CacheOptions {
  ttl?: number; // 秒
  tags?: string[];
}

export interface CacheAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  flush(): Promise<void>;
  keys(pattern: string): Promise<string[]>;
}

export interface TaggedCache {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options?: Omit<CacheOptions, "tags">): Promise<void>;
  flush(): Promise<void>;
}

export interface Cache {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options?: CacheOptions): Promise<void>;
  del(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  flush(): Promise<void>;
  tags(tags: string[]): TaggedCache;
  remember<T>(key: string, ttl: number, factory: () => Promise<T>): Promise<T>;
  singleflight<T>(key: string, factory: () => Promise<T>): Promise<T>;
}

const TAG_PREFIX = "tag:";

function createTaggedCache(adapter: CacheAdapter, tagNames: string[]): TaggedCache {
  async function get<T = unknown>(key: string): Promise<T | null> {
    const raw = await adapter.get(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  }

  async function set(key: string, value: unknown, options?: Omit<CacheOptions, "tags">): Promise<void> {
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

  return { get, set, del, has, flush, tags, remember, singleflight };
}

/**
 * @ventostack/observability — Cache Tracing Wrapper
 *
 * 包装 Cache 接口，为每次缓存操作创建子 Span，
 * 记录操作类型、key、命中/未命中和耗时。
 */

import type { Tracer, SpanContext } from "./tracing";
import type { Cache, CacheOptions, TaggedCache } from "@ventostack/cache";

export interface CacheTracingOptions {
  /** 获取当前请求的 SpanContext */
  getSpanContext: () => SpanContext | undefined;
}

/**
 * 包装 Cache 实例，添加追踪能力
 * @param cache - 原始 Cache 实例
 * @param tracer - 追踪器实例
 * @param options - 配置
 * @returns 包装后的 Cache 实例
 */
export function wrapCacheWithTracing(
  cache: Cache,
  tracer: Tracer,
  options: CacheTracingOptions,
): Cache {
  const run = <T>(name: string, key: string, fn: () => Promise<T>): Promise<T> => {
    const parentContext = options.getSpanContext();
    if (!parentContext) return fn();

    const span = tracer.startSpan(`cache.${name}`, parentContext);
    span.setAttribute("cache.key", key);
    return fn()
      .then((result) => {
        if (name === "get") {
          span.setAttribute("cache.hit", result !== null && result !== undefined);
        }
        span.end();
        return result;
      })
      .catch((err) => {
        span.setStatus("error");
        if (err instanceof Error) span.setAttribute("cache.error", err.message);
        span.end();
        throw err;
      });
  };

  return {
    get<T = unknown>(key: string): Promise<T | null> {
      return run("get", key, () => cache.get<T>(key));
    },
    set(key: string, value: unknown, opts?: CacheOptions): Promise<void> {
      return run("set", key, () => cache.set(key, value, opts));
    },
    del(key: string): Promise<void> {
      return run("del", key, () => cache.del(key));
    },
    has(key: string): Promise<boolean> {
      return run("has", key, () => cache.has(key));
    },
    flush(): Promise<void> {
      return run("flush", "*", () => cache.flush());
    },
    tags(tags: string[]): TaggedCache {
      const tagged = cache.tags(tags);
      return {
        get<T = unknown>(key: string): Promise<T | null> {
          return run("tagged.get", key, () => tagged.get<T>(key));
        },
        set(key: string, value: unknown, opts?: Omit<CacheOptions, "tags">): Promise<void> {
          return run("tagged.set", key, () => tagged.set(key, value, opts));
        },
        flush(): Promise<void> {
          return run("tagged.flush", tags.join(","), () => tagged.flush());
        },
      };
    },
    remember<T>(key: string, ttl: number, factory: () => Promise<T>): Promise<T> {
      return run("remember", key, () => cache.remember(key, ttl, factory));
    },
    singleflight<T>(key: string, factory: () => Promise<T>): Promise<T> {
      return run("singleflight", key, () => cache.singleflight(key, factory));
    },
  };
}

/**
 * @ventostack/observability — Redis Client Tracing Wrapper
 *
 * 包装 RedisClientInstance，为每次 Redis 命令创建子 Span，
 * 记录命令类型、key 和耗时。
 * 覆盖 session store、token revocation store 等直接使用 Redis client 的场景。
 */

import type { Tracer, SpanContext } from "./tracing";
import type { RedisClientInstance } from "@ventostack/cache";

export interface RedisTracingOptions {
  /** 获取当前请求的 SpanContext */
  getSpanContext: () => SpanContext | undefined;
}

/**
 * 包装 RedisClientInstance，添加追踪能力
 * @param client - 原始 Redis 客户端
 * @param tracer - 追踪器实例
 * @param options - 配置
 * @returns 包装后的 Redis 客户端（保持原始接口）
 */
export function wrapRedisClientWithTracing(
  client: RedisClientInstance,
  tracer: Tracer,
  options: RedisTracingOptions,
): RedisClientInstance {
  const trace = <T>(command: string, key: string, fn: () => Promise<T>): Promise<T> => {
    const parentContext = options.getSpanContext();
    if (!parentContext) return fn();

    const span = tracer.startSpan("redis.command", parentContext);
    span.setAttribute("redis.command", command);
    span.setAttribute("redis.key", key);
    return fn()
      .then((result) => {
        span.end();
        return result;
      })
      .catch((err) => {
        span.setStatus("error");
        if (err instanceof Error) span.setAttribute("redis.error", err.message);
        span.end();
        throw err;
      });
  };

  return {
    get(key: string) {
      return trace("GET", key, () => client.get(key));
    },
    set(key: string, value: string) {
      return trace("SET", key, () => client.set(key, value));
    },
    expire(key: string, seconds: number) {
      return trace("EXPIRE", key, () => client.expire(key, seconds));
    },
    del(key: string) {
      return trace("DEL", key, () => client.del(key));
    },
    exists(key: string) {
      return trace("EXISTS", key, () => client.exists(key));
    },
    keys(pattern: string) {
      return trace("KEYS", pattern, () => client.keys(pattern));
    },
    send(command: string, args: string[]) {
      return trace(command, args[0] ?? "", () => client.send(command, args));
    },
    incr(key: string) {
      return trace("INCR", key, () => client.incr(key));
    },
    pexpire(key: string, ms: number) {
      return trace("PEXPIRE", key, () => client.pexpire(key, ms));
    },
    pttl(key: string) {
      return trace("PTTL", key, () => client.pttl(key));
    },
    close() {
      return client.close();
    },
  };
}

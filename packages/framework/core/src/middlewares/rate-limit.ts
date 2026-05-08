// @ventostack/core - 限流中间件

import type { Context } from "../context";
import type { Middleware } from "../middleware";
import { getClientIPFromRequest } from "../client-ip";

/** 限流存储接口 */
export interface RateLimitStore {
  /**
   * 增加计数
   * @param key - 限流键
   * @param windowMs - 时间窗口（毫秒）
   * @returns 当前计数与重置时间
   */
  increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
  /**
   * 重置计数
   * @param key - 限流键
   */
  reset(key: string): Promise<void>;
}

/** 限流中间件配置选项 */
export interface RateLimitOptions {
  /** 时间窗口（毫秒），默认 60000 */
  windowMs?: number;
  /** 窗口内最大请求数，默认 100 */
  max?: number;
  /** 触发限流时的响应消息 */
  message?: string;
  /**
   * 是否信任代理头。
   * 默认 false，避免客户端通过伪造 X-Forwarded-For / X-Real-IP 绕过限流。
   */
  trustProxyHeaders?: boolean;
  /** 生成限流键的函数 */
  keyFn?: (ctx: Context) => string;
  /** 自定义存储后端 */
  store?: RateLimitStore;
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

/**
 * 创建内存限流存储（单实例）
 * @returns RateLimitStore 实例
 */
export function createMemoryRateLimitStore(): RateLimitStore {
  const windows = new Map<string, WindowEntry>();

  // 定期清理过期条目
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of windows) {
      if (now >= entry.resetAt) {
        windows.delete(key);
      }
    }
  }, 60_000);

  // 允许进程退出时不阻塞
  if (typeof cleanupInterval === "object" && "unref" in cleanupInterval) {
    cleanupInterval.unref();
  }

  return {
    async increment(key: string, windowMs: number) {
      const now = Date.now();
      const existing = windows.get(key);

      if (!existing || now >= existing.resetAt) {
        const entry: WindowEntry = { count: 1, resetAt: now + windowMs };
        windows.set(key, entry);
        return { count: 1, resetAt: entry.resetAt };
      }

      existing.count++;
      return { count: existing.count, resetAt: existing.resetAt };
    },

    async reset(key: string) {
      windows.delete(key);
    },
  };
}

/**
 * 默认限流键生成函数（基于客户端 IP）
 * @param ctx - 请求上下文
 * @returns IP 字符串
 */
function defaultKeyFn(ctx: Context, trustProxyHeaders = false): string {
  return getClientIPFromRequest(ctx.request, { trustProxyHeaders }) ?? "unknown";
}

/**
 * 最小 Redis 客户端接口，基于 Bun.RedisClient 设计
 */
export interface RedisClientLike {
  /** 执行 INCR 命令 */
  incr(key: string): Promise<number>;
  /** 执行 PEXPIRE 命令（毫秒），返回是否设置成功 */
  pexpire(key: string, milliseconds: number): Promise<number>;
  /** 执行 PTTL 命令（毫秒），-1 表示无过期，-2 表示键不存在 */
  pttl(key: string): Promise<number>;
  /** 执行 DEL 命令 */
  del(key: string): Promise<number>;
}

/** Redis 限流存储选项 */
export interface RedisRateLimitStoreOptions {
  /** Redis 客户端实例 */
  client: RedisClientLike;
  /** 键前缀，默认 "ratelimit:" */
  keyPrefix?: string;
}

/**
 * 创建 Redis 限流存储（支持分布式多实例）
 *
 * 使用原子 Lua 脚本保证 INCR + PEXPIRE 的一致性，避免 race condition。
 *
 * @example
 * ```typescript
 * import { createRedisRateLimitStore, rateLimit } from "@ventostack/core";
 * import { RedisClient } from "bun";
 *
 * const redis = new RedisClient("redis://localhost:6379");
 * const store = createRedisRateLimitStore({ client: redis });
 *
 * app.use(rateLimit({
 *   windowMs: 60_000,
 *   max: 100,
 *   store,
 * }));
 * ```
 */
export function createRedisRateLimitStore(options: RedisRateLimitStoreOptions): RateLimitStore {
  const { client, keyPrefix = "ratelimit:" } = options;

  // Lua 脚本：原子化 INCR + PEXPIRE
  const luaScript = `
    local current = redis.call('INCR', KEYS[1])
    if current == 1 then
      redis.call('PEXPIRE', KEYS[1], ARGV[1])
    end
    local ttl = redis.call('PTTL', KEYS[1])
    return {current, ttl}
  `;

  return {
    async increment(key: string, windowMs: number) {
      const fullKey = `${keyPrefix}${key}`;
      // 如果客户端支持 eval（Bun Redis），使用原子 Lua 脚本
      if ("eval" in client && typeof (client as unknown as Record<string, unknown>).eval === "function") {
        const result = await (client as unknown as { eval(script: string, keys: number, ...args: string[]): Promise<[number, number]> }).eval(
          luaScript,
          1,
          fullKey,
          String(windowMs),
        );
        const [count, ttlMs] = result;
        const resetAt = Date.now() + ttlMs;
        return { count, resetAt };
      }

      // 降级：分步执行（极小概率出现 race，绝大多数场景可接受）
      const count = await client.incr(fullKey);
      if (count === 1) {
        await client.pexpire(fullKey, windowMs);
      }
      const ttlMs = await client.pttl(fullKey);
      const resetAt = Date.now() + (ttlMs > 0 ? ttlMs : windowMs);
      return { count, resetAt };
    },

    async reset(key: string) {
      await client.del(`${keyPrefix}${key}`);
    },
  };
}

/**
 * 创建限流中间件
 * @param options - 限流配置选项
 * @returns Middleware 实例
 */
export function rateLimit(options: RateLimitOptions = {}): Middleware {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 100;
  const message = options.message ?? "请求过于频繁";
  const keyFn = options.keyFn ?? ((ctx: Context) => defaultKeyFn(ctx, options.trustProxyHeaders));
  const store = options.store ?? createMemoryRateLimitStore();

  return async (ctx: Context, next) => {
    const key = keyFn(ctx);
    const { count, resetAt } = await store.increment(key, windowMs);
    const remaining = Math.max(0, max - count);

    if (count > max) {
      const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
      return new Response(JSON.stringify({ error: message }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(max),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(resetAt),
        },
      });
    }

    const response = await next();
    const newHeaders = new Headers(response.headers);
    newHeaders.set("X-RateLimit-Limit", String(max));
    newHeaders.set("X-RateLimit-Remaining", String(remaining));
    newHeaders.set("X-RateLimit-Reset", String(resetAt));

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  };
}

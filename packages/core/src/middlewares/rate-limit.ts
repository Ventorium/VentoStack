// @aeron/core - 限流中间件

import type { Context } from "../context";
import type { Middleware } from "../middleware";

export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
  reset(key: string): Promise<void>;
}

export interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  message?: string;
  keyFn?: (ctx: Context) => string;
  store?: RateLimitStore;
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

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

function defaultKeyFn(ctx: Context): string {
  return ctx.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? ctx.headers.get("x-real-ip")
    ?? "unknown";
}

export function rateLimit(options: RateLimitOptions = {}): Middleware {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 100;
  const message = options.message ?? "Too Many Requests";
  const keyFn = options.keyFn ?? defaultKeyFn;
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

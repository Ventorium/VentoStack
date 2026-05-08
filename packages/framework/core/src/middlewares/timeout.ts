// @ventostack/core - 超时中间件

import type { Middleware } from "../middleware";

const VENTOSTACK_TIMEOUT_SENTINEL = "__VENTOSTACK_TIMEOUT__";

/** 超时中间件配置选项 */
export interface TimeoutOptions {
  /** 超时时间（毫秒），默认 30000 */
  ms?: number;
  /** 超时响应消息，默认 "请求超时" */
  message?: string;
}

/**
 * 创建请求超时中间件
 * 超过指定时间未返回则返回 408 响应
 * @param options - 超时配置选项
 * @returns Middleware 实例
 */
export function timeout(options: TimeoutOptions = {}): Middleware {
  const ms = options.ms ?? 30_000;
  const message = options.message ?? "请求超时";

  return async (_ctx, next) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);

    try {
      const result = await Promise.race([
        next(),
        new Promise<Response>((_, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(new Error(VENTOSTACK_TIMEOUT_SENTINEL));
          });
        }),
      ]);
      clearTimeout(timer);
      return result;
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.message === VENTOSTACK_TIMEOUT_SENTINEL) {
        return new Response(JSON.stringify({ error: message }), {
          status: 408,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw err;
    }
  };
}

// @ventostack/core - 超时中间件

import type { Middleware } from "../middleware";

const VENTOSTACK_TIMEOUT_SENTINEL = "__VENTOSTACK_TIMEOUT__";

/** ctx.state 上豁免全局请求超时的标记键（由 longRunning() 中间件写入） */
const SKIP_TIMEOUT_KEY = "skipRequestTimeout";

/** 超时中间件配置选项 */
export interface TimeoutOptions {
  /** 超时时间（毫秒），默认 30000 */
  ms?: number;
  /** 超时响应消息，默认 "请求超时" */
  message?: string;
}

/**
 * 路由级中间件：声明当前端点为长耗时操作（SSE 流式、文件上传+OCR 等），
 * 豁免全局请求超时限制。超时判断在计时器触发时读取 ctx.state 标记，
 * 因此无论本中间件与全局超时中间件的注册顺序如何，只要在计时器触发前
 * 进入路由链即可生效。
 */
export function longRunning(): Middleware {
  return async (ctx, next) => {
    ctx.state[SKIP_TIMEOUT_KEY] = true;
    return next();
  };
}

/**
 * 创建请求超时中间件
 * 超过指定时间未返回则返回 408 响应；路由经 longRunning() 声明的除外
 * @param options - 超时配置选项
 * @returns Middleware 实例
 */
export function timeout(options: TimeoutOptions = {}): Middleware {
  const ms = options.ms ?? 30_000;
  const message = options.message ?? "请求超时";

  return async (ctx, next) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      // 路由已声明长耗时（文件上传、OCR、SSE）：放弃中止，让处理跑完
      if (ctx.state[SKIP_TIMEOUT_KEY] === true) return;
      controller.abort();
    }, ms);

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

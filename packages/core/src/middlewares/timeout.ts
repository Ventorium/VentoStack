// @aeron/core - 超时中间件

import type { Middleware } from "../middleware";

export interface TimeoutOptions {
  ms?: number;
  message?: string;
}

export function timeout(options: TimeoutOptions = {}): Middleware {
  const ms = options.ms ?? 30_000;
  const message = options.message ?? "Request Timeout";

  return async (_ctx, next) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);

    try {
      const result = await Promise.race([
        next(),
        new Promise<Response>((_, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(new Error("__AERON_TIMEOUT__"));
          });
        }),
      ]);
      clearTimeout(timer);
      return result;
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.message === "__AERON_TIMEOUT__") {
        return new Response(JSON.stringify({ error: message }), {
          status: 408,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw err;
    }
  };
}

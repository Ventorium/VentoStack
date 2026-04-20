// @aeron/core - 请求 ID 中间件

import type { Context } from "../context";
import type { Middleware } from "../middleware";

export function requestId(headerName = "X-Request-Id"): Middleware {
  return async (ctx: Context, next) => {
    const id = ctx.headers.get(headerName) ?? crypto.randomUUID();
    ctx.state.set("requestId", id);

    const response = await next();
    const newHeaders = new Headers(response.headers);
    newHeaders.set(headerName, id);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  };
}

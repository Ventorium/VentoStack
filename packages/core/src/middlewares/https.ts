// @aeron/core - HTTPS 强制与 HSTS 中间件

import type { Middleware } from "../middleware";

export interface HTTPSOptions {
  /** 是否启用 HSTS header */
  hsts?: boolean;
  /** HSTS max-age（秒），默认 1年 */
  maxAge?: number;
  /** 是否包含子域 */
  includeSubDomains?: boolean;
  /** 是否添加 preload 标记 */
  preload?: boolean;
  /** 信任的代理 header（默认 X-Forwarded-Proto） */
  proxyHeader?: string;
  /** 排除的路径（如健康检查） */
  excludePaths?: string[];
}

export function httpsEnforce(options: HTTPSOptions = {}): Middleware {
  const {
    hsts = true,
    maxAge = 31536000,
    includeSubDomains = true,
    preload = false,
    proxyHeader = "x-forwarded-proto",
    excludePaths = [],
  } = options;

  let hstsValue = `max-age=${maxAge}`;
  if (includeSubDomains) hstsValue += "; includeSubDomains";
  if (preload) hstsValue += "; preload";

  const excludeSet = new Set(excludePaths);

  return async (ctx, next) => {
    // 排除路径跳过
    if (excludeSet.has(ctx.path)) {
      return next();
    }

    const proto = ctx.request.headers.get(proxyHeader) ?? "http";
    const isSecure = proto === "https";

    // 非 HTTPS 时重定向
    if (!isSecure) {
      const url = new URL(ctx.request.url);
      url.protocol = "https:";
      return new Response(null, {
        status: 301,
        headers: { Location: url.toString() },
      });
    }

    const response = await next();

    // 添加 HSTS header
    if (hsts) {
      const headers = new Headers(response.headers);
      headers.set("Strict-Transport-Security", hstsValue);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    return response;
  };
}

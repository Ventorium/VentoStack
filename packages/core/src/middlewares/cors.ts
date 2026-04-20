// @aeron/core - CORS 中间件

import type { Context } from "../context";
import type { Middleware } from "../middleware";

export interface CorsOptions {
  origin?: string | string[] | ((origin: string) => boolean);
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

function isOriginAllowed(
  requestOrigin: string,
  option: CorsOptions["origin"],
): boolean {
  if (option === undefined) {
    return false; // 默认 deny
  }
  if (typeof option === "string") {
    return option === requestOrigin;
  }
  if (Array.isArray(option)) {
    return option.includes(requestOrigin);
  }
  return option(requestOrigin);
}

export function cors(options: CorsOptions = {}): Middleware {
  // 安全检查：禁止 credentials + wildcard origin
  if (options.credentials && options.origin === "*") {
    throw new Error("CORS credentials with wildcard origin is not allowed");
  }

  const methods = options.methods ?? ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"];
  const allowedHeaders = options.allowedHeaders;
  const exposedHeaders = options.exposedHeaders;
  const credentials = options.credentials ?? false;
  const maxAge = options.maxAge;

  return async (ctx: Context, next) => {
    const requestOrigin = ctx.headers.get("origin") ?? "";

    // 无 origin header 则不处理 CORS
    if (!requestOrigin) {
      return next();
    }

    const allowed = isOriginAllowed(requestOrigin, options.origin);

    if (!allowed) {
      // origin 不允许，不附加 CORS headers
      if (ctx.method === "OPTIONS") {
        return new Response(null, { status: 403 });
      }
      return next();
    }

    const corsHeaders = new Headers();
    corsHeaders.set("Access-Control-Allow-Origin", requestOrigin);

    if (credentials) {
      corsHeaders.set("Access-Control-Allow-Credentials", "true");
    }

    if (exposedHeaders && exposedHeaders.length > 0) {
      corsHeaders.set("Access-Control-Expose-Headers", exposedHeaders.join(", "));
    }

    // Preflight
    if (ctx.method === "OPTIONS") {
      corsHeaders.set("Access-Control-Allow-Methods", methods.join(", "));
      if (allowedHeaders && allowedHeaders.length > 0) {
        corsHeaders.set("Access-Control-Allow-Headers", allowedHeaders.join(", "));
      } else {
        // 反射请求头
        const requestHeaders = ctx.headers.get("access-control-request-headers");
        if (requestHeaders) {
          corsHeaders.set("Access-Control-Allow-Headers", requestHeaders);
        }
      }
      if (maxAge !== undefined) {
        corsHeaders.set("Access-Control-Max-Age", String(maxAge));
      }
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // 非预检请求：调用 next，在 response 上附加 CORS headers
    const response = await next();
    const newHeaders = new Headers(response.headers);
    corsHeaders.forEach((value, key) => {
      newHeaders.set(key, value);
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  };
}

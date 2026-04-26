/**
 * CORS 中间件
 */

import { cors as ventoCors } from "@ventostack/core";
import type { Middleware } from "@ventostack/core";
import { env } from "../config";

/**
 * 创建 CORS 中间件
 * 生产环境建议通过反向代理（Nginx/Caddy）处理 CORS，此中间件仅用于开发环境。
 */
export function createCorsMiddleware(): Middleware {
  return ventoCors({
    origin: env.ALLOWED_ORIGINS,
    credentials: true,
    maxAge: 86400,
  });
}

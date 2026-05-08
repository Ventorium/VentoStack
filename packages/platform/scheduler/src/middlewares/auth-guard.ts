/**
 * @ventostack/scheduler - 认证中间件（简化版）
 */

import type { Middleware } from "@ventostack/core";
import type { JWTManager } from "@ventostack/auth";

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

export function createAuthMiddleware(jwt: JWTManager, secret: string): Middleware {
  return async (ctx, next) => {
    const authHeader = ctx.request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ code: 401, message: "缺少认证令牌" }),
        { status: 401, headers: JSON_HEADERS },
      );
    }

    const token = authHeader.slice(7);
    try {
      const payload = await jwt.verify(token, secret);
      ctx.user = {
        id: payload.sub ?? "",
        roles: ((payload as Record<string, unknown>).roles as string[]) ?? [],
        username: ((payload as Record<string, unknown>).username as string) ?? "",
      };
      return next();
    } catch {
      return new Response(
        JSON.stringify({ code: 401, message: "无效的认证令牌" }),
        { status: 401, headers: JSON_HEADERS },
      );
    }
  };
}

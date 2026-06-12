/**
 * AI 模块认证/权限中间件
 */
import type { JWTManager, RBAC } from "@ventostack/auth";
import type { Middleware } from "@ventostack/core";

export function createAuthMiddleware(
  jwt: JWTManager,
  jwtSecret: string,
): Middleware {
  return async (ctx, next) => {
    const authHeader = ctx.request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ code: 0, message: "未登录" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const token = authHeader.slice(7);
    try {
      const payload = await jwt.verify(token, jwtSecret);
      ctx.user = payload;
      return next();
    } catch {
      return new Response(
        JSON.stringify({ code: 0, message: "token 无效或已过期" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }
  };
}

export function createPermMiddleware(
  rbac: RBAC,
): (resource: string, action: string) => Middleware {
  return (resource: string, action: string): Middleware => {
    return async (ctx, next) => {
      const user = ctx.user as
        | { roles?: string[]; [key: string]: unknown }
        | undefined;
      if (!user) {
        return new Response(
          JSON.stringify({ code: 0, message: "未登录" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }

      // 超管跳过
      if (user.roles?.includes("admin")) return next();

      // 检查权限
      if (rbac) {
        const hasPermission = user.roles?.some((role: string) =>
          rbac.hasPermission(role, resource, action),
        );
        if (!hasPermission) {
          return new Response(
            JSON.stringify({ code: 0, message: "权限不足" }),
            { status: 403, headers: { "Content-Type": "application/json" } },
          );
        }
      }

      return next();
    };
  };
}

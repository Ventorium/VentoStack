/**
 * @ventostack/system - 认证与权限中间件
 * 提供基于 JWT 的认证中间件与基于 RBAC 的权限校验中间件
 */

import type { Middleware } from "@ventostack/core";
import type { JWTManager } from "@ventostack/auth";
import type { RBAC } from "@ventostack/auth";

/** 认证后的用户信息（注入到 ctx.user） */
export interface AuthUser {
  id: string;
  roles: string[];
  username: string;
}

/** 超级管理员角色代码，拥有所有权限 */
const SUPER_ADMIN_ROLE = "admin";

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

/**
 * 创建认证中间件
 * 从 Authorization 头提取 Bearer Token，验证 JWT 并将用户信息注入 ctx.user
 *
 * @param jwt JWT 管理器实例
 * @param secret JWT 签名密钥
 * @returns Middleware 实例
 */
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
        roles: (payload as Record<string, unknown>).roles as string[] ?? [],
        username: ((payload as Record<string, unknown>).username as string) ?? "",
      } satisfies AuthUser;
      return next();
    } catch {
      return new Response(
        JSON.stringify({ code: 401, message: "无效的认证令牌" }),
        { status: 401, headers: JSON_HEADERS },
      );
    }
  };
}

/**
 * 创建权限校验中间件工厂
 * 返回一个函数，该函数接受 resource 和 action 参数，生成对应的权限校验中间件
 *
 * @param rbac RBAC 管理器实例
 * @returns 权限校验中间件工厂函数
 */
export function createPermMiddleware(rbac: RBAC): (resource: string, action: string) => Middleware {
  return (resource: string, action: string): Middleware => {
    return async (ctx, next) => {
      const user = ctx.user as AuthUser | undefined;
      if (!user) {
        return new Response(
          JSON.stringify({ code: 401, message: "未登录" }),
          { status: 401, headers: JSON_HEADERS },
        );
      }

      // 超级管理员跳过权限检查
      if (user.roles.includes(SUPER_ADMIN_ROLE)) {
        return next();
      }

      const allowed = user.roles.some(
        (role) => rbac.hasPermission(role, resource, action),
      );
      if (!allowed) {
        return new Response(
          JSON.stringify({ code: 403, message: `无权限：${resource}:${action}` }),
          { status: 403, headers: JSON_HEADERS },
        );
      }

      return next();
    };
  };
}

/**
 * @ventostack/i18n - 模块聚合
 */

import type { Database } from "@ventostack/database";
import type { JWTManager, RBAC } from "@ventostack/auth";
import type { Router } from "@ventostack/core";
import { createI18nService } from "./services/i18n";
import type { I18nService } from "./services/i18n";
import { createI18nRoutes } from "./routes/i18n";
import { createAuthMiddleware } from "./middlewares/auth-guard";

export interface I18nModule {
  services: {
    i18n: I18nService;
  };
  router: Router;
  init(): Promise<void>;
}

export interface I18nModuleDeps {
  db: Database;
  jwt: JWTManager;
  jwtSecret: string;
  rbac?: RBAC;
}

export function createI18nModule(deps: I18nModuleDeps): I18nModule {
  const { db, jwt, jwtSecret, rbac } = deps;

  const i18nService = createI18nService({ db });
  const authMiddleware = createAuthMiddleware(jwt, jwtSecret);

  const perm = (resource: string, action: string) => {
    return async (ctx: any, next: any) => {
      const user = ctx.user as { roles: string[] } | undefined;
      if (!user) {
        return new Response(JSON.stringify({ code: 401, message: "未登录" }), { status: 401, headers: { "Content-Type": "application/json" } });
      }
      if (rbac) {
        const allowed = user.roles.some((r: string) => rbac.hasPermission(r, resource, action));
        if (!allowed) {
          return new Response(JSON.stringify({ code: 403, message: `无权限：${resource}:${action}` }), { status: 403, headers: { "Content-Type": "application/json" } });
        }
      }
      return next();
    };
  };

  const router = createI18nRoutes(i18nService, authMiddleware, perm as any);

  return {
    services: { i18n: i18nService },
    router,
    async init() {},
  };
}

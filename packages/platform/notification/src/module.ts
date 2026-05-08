/**
 * @ventostack/notify - 模块聚合
 */

import type { Database } from "@ventostack/database";
import type { JWTManager, RBAC } from "@ventostack/auth";
import type { Router } from "@ventostack/core";
import { createNotificationService } from "./services/notification";
import type { NotifyChannel, NotificationService } from "./services/notification";
import { createNotificationRoutes } from "./routes/notification";
import { createAuthMiddleware } from "./middlewares/auth-guard";

export interface NotificationModule {
  services: {
    notification: NotificationService;
  };
  router: Router;
  init(): Promise<void>;
}

export interface NotificationModuleDeps {
  db: Database;
  jwt: JWTManager;
  jwtSecret: string;
  rbac?: RBAC;
  channels: Map<string, NotifyChannel>;
}

export function createNotificationModule(deps: NotificationModuleDeps): NotificationModule {
  const { db, jwt, jwtSecret, rbac, channels } = deps;

  const notificationService = createNotificationService({ db, channels });
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

  const router = createNotificationRoutes(notificationService, authMiddleware, perm as any);

  return {
    services: { notification: notificationService },
    router,
    async init() {},
  };
}

/**
 * @ventostack/monitor - 模块聚合
 */

import type { JWTManager, RBAC } from "@ventostack/auth";
import type { Router, Middleware } from "@ventostack/core";
import type { HealthCheck } from "@ventostack/observability";
import type { Database } from "@ventostack/database";
import { createMonitorService } from "./services/monitor";
import type { MonitorService, CacheStatus, DataSourceStatus } from "./services/monitor";
import { createMonitorRoutes } from "./routes/monitor";
import { createAuthMiddleware } from "./middlewares/auth-guard";

export interface MonitorModule {
  services: {
    monitor: MonitorService;
  };
  router: Router;
  init(): Promise<void>;
}

export interface MonitorModuleDeps {
  healthCheck: HealthCheck;
  jwt: JWTManager;
  jwtSecret: string;
  rbac?: RBAC;
  db?: Database;
  cacheStatsProvider?: () => Promise<CacheStatus>;
  dataSourceStatsProvider?: () => Promise<DataSourceStatus>;
}

export function createMonitorModule(deps: MonitorModuleDeps): MonitorModule {
  const { healthCheck, jwt, jwtSecret, rbac, db, cacheStatsProvider, dataSourceStatsProvider } = deps;

  const monitorService = createMonitorService({ healthCheck, db, cacheStatsProvider, dataSourceStatsProvider });
  const authMiddleware = createAuthMiddleware(jwt, jwtSecret);

  const perm = (resource: string, action: string): Middleware => {
    return async (ctx, next) => {
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

  const router = createMonitorRoutes(monitorService, authMiddleware, perm);

  return {
    services: { monitor: monitorService },
    router,
    async init() {},
  };
}

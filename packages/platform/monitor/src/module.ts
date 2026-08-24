/**
 * @ventostack/monitor - 模块聚合
 */

import type { JWTManager, RBAC } from "@ventostack/auth";
import type { Middleware, Router } from "@ventostack/core";
import type { Database } from "@ventostack/database";
import type { HealthCheck } from "@ventostack/observability";
import { createAuthMiddleware, createPermMiddleware } from "@ventostack/auth";
import { createMonitorRoutes } from "./routes/monitor";
import { createMonitorService } from "./services/monitor";
import type { CacheStatus, DataSourceStatus, MonitorService } from "./services/monitor";

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
  /** RBAC 管理器实例（必填，避免权限校验被静默跳过） */
  rbac: RBAC;
  db?: Database;
  cacheStatsProvider?: () => Promise<CacheStatus>;
  dataSourceStatsProvider?: () => Promise<DataSourceStatus>;
}

export function createMonitorModule(deps: MonitorModuleDeps): MonitorModule {
  const { healthCheck, jwt, jwtSecret, rbac, db, cacheStatsProvider, dataSourceStatsProvider } =
    deps;

  const monitorService = createMonitorService({
    healthCheck,
    db,
    cacheStatsProvider,
    dataSourceStatsProvider,
  });
  const authMiddleware = createAuthMiddleware(jwt, jwtSecret);

  const perm = createPermMiddleware(rbac);

  const router = createMonitorRoutes(monitorService, authMiddleware, perm);

  return {
    services: { monitor: monitorService },
    router,
    async init() {},
  };
}

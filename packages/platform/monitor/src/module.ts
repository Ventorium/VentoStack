/**
 * @ventostack/monitor - 模块聚合
 */

import type {
  AuthSessionManager,
  JWTManager,
  MultiDeviceManager,
  RBAC,
  SessionManager,
} from '@ventostack/auth';
import type { Middleware, Router } from '@ventostack/core';
import type { Database } from '@ventostack/database';
import type { HealthCheck } from '@ventostack/observability';
import { createAuthMiddleware, createPermMiddleware } from '@ventostack/auth';
import { createMonitorRoutes } from './routes/monitor';
import { createMonitorService } from './services/monitor';
import type { CacheStatus, DataSourceStatus, MonitorService } from './services/monitor';
import type { SystemMetricsProvider } from './services/system-metrics';

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
  tenantId: string;
  authSessionManager: AuthSessionManager;
  sessionManager: SessionManager;
  multiDeviceManager: MultiDeviceManager;
  db?: Database;
  systemMetricsProvider?: SystemMetricsProvider;
  cacheStatsProvider?: () => Promise<CacheStatus>;
  dataSourceStatsProvider?: () => Promise<DataSourceStatus>;
}

export function createMonitorModule(deps: MonitorModuleDeps): MonitorModule {
  const {
    healthCheck,
    jwt,
    jwtSecret,
    rbac,
    db,
    authSessionManager,
    sessionManager,
    multiDeviceManager,
    cacheStatsProvider,
    dataSourceStatsProvider,
    systemMetricsProvider,
  } = deps;

  const monitorService = createMonitorService({
    healthCheck,
    tenantId: deps.tenantId,
    authSessionManager,
    sessionManager,
    multiDeviceManager,
    ...(db !== undefined ? { db } : {}),
    ...(cacheStatsProvider !== undefined ? { cacheStatsProvider } : {}),
    ...(dataSourceStatsProvider !== undefined ? { dataSourceStatsProvider } : {}),
    ...(systemMetricsProvider !== undefined ? { systemMetricsProvider } : {}),
  });
  const authMiddleware = createAuthMiddleware(jwt, jwtSecret, deps.tenantId);

  const perm = createPermMiddleware(rbac);

  const router = createMonitorRoutes(monitorService, authMiddleware, perm);

  return {
    services: { monitor: monitorService },
    router,
    async init() {},
  };
}

/**
 * @ventostack/boot - 平台聚合器
 *
 * 一键创建完整的 VentoStack 平台，聚合所有业务模块。
 */

import type { Router } from "@ventostack/core";
import type { SqlExecutor, TableSchemaInfo, Database } from "@ventostack/database";
import { createDatabase } from "@ventostack/database";
import type { Cache } from "@ventostack/cache";
import type { JWTManager, PasswordHasher, TOTPManager, RBAC, RowFilter, AuthSessionManager, TokenRefreshManager, SessionManager, MultiDeviceManager } from "@ventostack/auth";
import type { EventBus } from "@ventostack/events";
import type { AuditStore, HealthCheck } from "@ventostack/observability";

import { createSystemModule } from "@ventostack/system";
import type { SystemModule } from "@ventostack/system";
import { createGenModule } from "@ventostack/gen";
import type { GenModule } from "@ventostack/gen";
import { createMonitorModule } from "@ventostack/monitor";
import type { MonitorModule } from "@ventostack/monitor";
import { createNotificationModule } from "@ventostack/notification";
import type { NotificationModule, NotifyChannel } from "@ventostack/notification";
import { createI18nModule } from "@ventostack/i18n";
import type { I18nModule } from "@ventostack/i18n";
import { createWorkflowModule } from "@ventostack/workflow";
import type { WorkflowModule } from "@ventostack/workflow";
import { createOSSModule } from "@ventostack/oss";
import type { OSSModule, StorageAdapter } from "@ventostack/oss";
import { createSchedulerModule } from "@ventostack/scheduler";
import type { SchedulerModule, JobHandlerMap } from "@ventostack/scheduler";
import type { Scheduler } from "@ventostack/events";

/** 平台配置 */
export interface PlatformConfig {
  /** 数据库 executor */
  executor: SqlExecutor;
  /** 数据库实例（可选，若未提供则自动从 executor 创建） */
  db?: Database;
  /** 数据库表结构读取 */
  readTableSchema: (executor: SqlExecutor, tableName: string) => Promise<TableSchemaInfo>;
  /** 数据库表列表 */
  listTables: (executor: SqlExecutor) => Promise<string[]>;
  /** 缓存 */
  cache: Cache;
  /** JWT 管理 */
  jwt: JWTManager;
  /** JWT 密钥 */
  jwtSecret: string;
  /** 密码哈希 */
  passwordHasher: PasswordHasher;
  /** TOTP 管理器 */
  totpManager: TOTPManager;
  /** RBAC 权限 */
  rbac: RBAC;
  /** 行级过滤 */
  rowFilter: RowFilter;
  /** 会话管理 */
  authSessionManager: AuthSessionManager;
  /** Token 刷新 */
  tokenRefreshManager: TokenRefreshManager;
  /** Session 管理 */
  sessionManager: SessionManager;
  /** 多设备管理 */
  multiDeviceManager: MultiDeviceManager;
  /** 审计存储 */
  auditStore: AuditStore;
  /** 事件总线 */
  eventBus: EventBus;
  /** 健康检查 */
  healthCheck: HealthCheck;
  /** 调度器 */
  scheduler: Scheduler;

  /** 模块开关 */
  modules?: {
    system?: boolean;
    gen?: boolean;
    monitor?: boolean;
    notification?: boolean;
    i18n?: boolean;
    workflow?: boolean;
    oss?: boolean;
    scheduler?: boolean;
  };

  /** OSS 存储适配器 */
  storageAdapter?: StorageAdapter;
  /** 通知通道 */
  notifyChannels?: Map<string, NotifyChannel>;
  /** 定时任务处理器 */
  jobHandlers?: JobHandlerMap;
  /** WebAuthn RP ID */
  rpID?: string;
  /** WebAuthn RP 名称 */
  rpName?: string;
  /** WebAuthn 允许来源 */
  rpOrigins?: string[];
}

/** 平台实例 */
export interface Platform {
  /** 系统模块 */
  system?: SystemModule;
  /** 代码生成模块 */
  gen?: GenModule;
  /** 监控模块 */
  monitor?: MonitorModule;
  /** 通知模块 */
  notification?: NotificationModule;
  /** 国际化模块 */
  i18n?: I18nModule;
  /** 工作流模块 */
  workflow?: WorkflowModule;
  /** 文件存储模块 */
  oss?: OSSModule;
  /** 定时任务模块 */
  scheduler?: SchedulerModule;
  /** 所有路由的聚合 */
  router: Router;
  /** 初始化所有模块 */
  init(): Promise<void>;
}

/**
 * 创建完整的 VentoStack 平台
 */
export async function createPlatform(config: PlatformConfig): Promise<Platform> {
  const {
    executor, readTableSchema, listTables, cache,
    db: providedDb,
    jwt, jwtSecret, passwordHasher, totpManager, rbac, rowFilter,
    authSessionManager, tokenRefreshManager, sessionManager, multiDeviceManager,
    auditStore, eventBus, healthCheck, scheduler,
    modules: moduleFlags,
    storageAdapter, notifyChannels, jobHandlers, rpID, rpName, rpOrigins,
  } = config;

  const db = providedDb ?? createDatabase({ executor });

  const enabled = {
    system: moduleFlags?.system !== false,
    gen: moduleFlags?.gen !== false,
    monitor: moduleFlags?.monitor !== false,
    notification: moduleFlags?.notification !== false,
    i18n: moduleFlags?.i18n !== false,
    workflow: moduleFlags?.workflow !== false,
    oss: moduleFlags?.oss !== false,
    scheduler: moduleFlags?.scheduler !== false,
  };

  // Create modules
  const systemDeps = {
    db, cache, jwt, jwtSecret, passwordHasher, totp: totpManager,
    rbac, rowFilter, authSessionManager, tokenRefresh: tokenRefreshManager,
    sessionManager, deviceManager: multiDeviceManager, auditLog: auditStore, eventBus,
    ...(rpID !== undefined ? { rpID } : {}),
    ...(rpName !== undefined ? { rpName } : {}),
    ...(rpOrigins !== undefined ? { rpOrigins } : {}),
  };
  const system = enabled.system ? createSystemModule(systemDeps) : undefined;

  const gen = enabled.gen ? createGenModule({
    db, executor, readTableSchema, jwt, jwtSecret, rbac,
  }) : undefined;

  const monitor = enabled.monitor ? createMonitorModule({
    healthCheck, jwt, jwtSecret, rbac, db,
  }) : undefined;

  const notification = enabled.notification && notifyChannels ? createNotificationModule({
    db, jwt, jwtSecret, rbac, channels: notifyChannels,
  }) : undefined;

  const i18n = enabled.i18n ? createI18nModule({
    db, jwt, jwtSecret, rbac,
  }) : undefined;

  const workflow = enabled.workflow ? createWorkflowModule({
    db, jwt, jwtSecret, rbac,
  }) : undefined;

  const oss = enabled.oss && storageAdapter ? createOSSModule({
    db, storage: storageAdapter, jwt, jwtSecret, rbac,
  }) : undefined;

  const schedulerMod = enabled.scheduler ? createSchedulerModule({
    db, scheduler, jwt, jwtSecret, rbac, handlers: jobHandlers ?? {},
  }) : undefined;

  // Aggregate routers
  const { createRouter } = await import("@ventostack/core");
  const router = createRouter();

  // Mount module routers
  if (system) router.merge(system.router);
  if (gen) router.merge(gen.router);
  if (monitor) router.merge(monitor.router);
  if (notification) router.merge(notification.router);
  if (i18n) router.merge(i18n.router);
  if (workflow) router.merge(workflow.router);
  if (oss) router.merge(oss.router);
  if (schedulerMod) router.merge(schedulerMod.router);

  return {
    ...(system !== undefined ? { system } : {}),
    ...(gen !== undefined ? { gen } : {}),
    ...(monitor !== undefined ? { monitor } : {}),
    ...(notification !== undefined ? { notification } : {}),
    ...(i18n !== undefined ? { i18n } : {}),
    ...(workflow !== undefined ? { workflow } : {}),
    ...(oss !== undefined ? { oss } : {}),
    ...(schedulerMod !== undefined ? { scheduler: schedulerMod } : {}),
    router,
    async init() {
      if (system) await system.init();
      if (gen) await gen.init();
      if (monitor) await monitor.init();
      if (notification) await notification.init();
      if (i18n) await i18n.init();
      if (workflow) await workflow.init();
      if (oss) await oss.init();
      if (schedulerMod) await schedulerMod.init();
    },
  };
}

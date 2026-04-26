/**
 * 应用装配工厂（Composition Root）
 *
 * 职责：
 * 1. 按依赖顺序初始化各层
 * 2. 组装中间件管道
 * 3. 注册路由
 * 4. 返回启动/关闭接口
 *
 * 依赖方向：infra → auth → system → app → entry
 */

import { createApp, requestId, requestLogger } from "@ventostack/core";
import type { VentoStackApp } from "@ventostack/core";

import { env } from "./config";
import { createDatabaseConnection, runMigrations, runSeeds } from "./database";
import type { DatabaseContext } from "./database";
import { createCacheInstance, type Cache } from "./cache";
import { assembleAuthEngines, type AuthEngines } from "./auth";
import { createAppAuditLog, createAppHealthCheck, createAppLogger } from "./observability";
import type { AuditStore } from "./observability";
import { assembleSystemModule } from "./system";
import { createCorsMiddleware, createErrorHandlerMiddleware } from "./middlewares";

export interface AppContext {
  /** VentoStack 应用实例 */
  app: VentoStackApp;
  /** 基础设施引用（用于优雅关闭） */
  infra: {
    database: DatabaseContext;
  };
}

/**
 * 装配并启动应用
 * 失败时抛异常，由入口层处理
 */
export async function buildApp(): Promise<AppContext> {
  // =============================================
  // 1. 基础设施层
  // =============================================

  const logger = createAppLogger();
  console.log(`[app] Starting ${env.NODE_ENV} mode`);

  // 1a. 数据库
  console.log("[app] Connecting to database...");
  const database = createDatabaseConnection();
  const { executor } = database;
  console.log("[app] Database connected");

  // 1b. 运行迁移
  await runMigrations(executor);

  // 1c. 种子数据
  await runSeeds(executor);

  // 1d. 缓存
  const cache: Cache = createCacheInstance();

  // 1e. 审计日志
  const auditLog: AuditStore = createAppAuditLog();

  // 1f. 健康检查
  const healthCheck = createAppHealthCheck(executor);

  // =============================================
  // 2. 认证引擎层
  // =============================================

  const auth: AuthEngines = assembleAuthEngines();

  // =============================================
  // 3. 系统模块层
  // =============================================

  const system = assembleSystemModule({ executor, cache, auth, auditLog });

  // 3a. 加载权限
  await system.init();

  // =============================================
  // 4. 应用装配
  // =============================================

  const app = createApp({ port: env.PORT, hostname: env.HOST });

  // 4a. 全局中间件（顺序敏感）
  app.use(requestId());
  app.use(createCorsMiddleware());
  app.use(requestLogger());

  // 4b. 健康检查端点（无需认证）
  // 手动注册健康检查路由

  // 4c. 系统模块路由
  app.use(system.router);

  // 4d. 错误处理（必须最后注册）
  app.use(createErrorHandlerMiddleware({ logger }));

  // =============================================
  // 5. 返回
  // =============================================

  return {
    app,
    infra: {
      database,
    },
  };
}

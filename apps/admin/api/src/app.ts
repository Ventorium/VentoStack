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

import { createApp, createRouter, requestId, requestLogger, errorHandler, cors, createTagLogger } from "@ventostack/core";
import type { VentoStackApp } from "@ventostack/core";
import { setupOpenAPI } from "@ventostack/openapi";
import { getDefaultLogger } from "@ventostack/observability";
import type { Logger } from "@ventostack/observability";
import { createAuditLog, createDefaultHealthCheck } from "@ventostack/observability";

import { env } from "./config";
import { createDatabaseConnection, runMigrations, runSeeds } from "./database";
import type { DatabaseContext } from "./database";
import { createCacheInstance, type CacheInstance } from "./cache";
import { assembleAuthEngines } from "./auth";
import { assembleSystemModule } from "./system";
import { createMonitorModule } from "@ventostack/monitor";

export interface AppContext {
  /** VentoStack 应用实例 */
  app: VentoStackApp;
  /** 基础设施引用（用于优雅关闭） */
  infra: {
    database: DatabaseContext;
    cache: CacheInstance;
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
  const logger = createTagLogger('app')
  logger.info(`Starting mode: ${env.NODE_ENV }`);

  // 1a. 数据库
  const database = createDatabaseConnection();
  const { executor } = database;
  logger.info("Database connected");

  // 1b. 运行迁移（使用单连接 executor）
  await runMigrations(database.migrationExecutor);

  // 1c. 种子数据（使用连接池 executor）
  await runSeeds(executor);

  // 1d. 缓存
  const cacheInstance = await createCacheInstance();

  // 1e. 审计日志
  const auditLog = createAuditLog();

  // 1f. 健康检查
  const healthCheck = createDefaultHealthCheck({
    sql: executor,
    ...(cacheInstance.redisClient ? { redis: cacheInstance.redisClient } : {}),
  });

  // =============================================
  // 2. 认证引擎层
  // =============================================

  const auth = assembleAuthEngines();

  // =============================================
  // 3. 系统模块层
  // =============================================

  const system = assembleSystemModule({ executor, cache: cacheInstance.cache, auth, auditLog });

  // 3a. 加载权限
  await system.init();

  // 3b. 监控模块
  const monitor = createMonitorModule({
    healthCheck,
    jwt: auth.jwt,
    jwtSecret: auth.jwtSecret,
    rbac: auth.rbac,
    executor,
  });

  // =============================================
  // 4. 应用装配
  // =============================================

  const app = createApp({ port: env.PORT, hostname: env.HOST });

  // 4a. 全局中间件（顺序敏感）
  app.use(requestId());
  app.use(cors({
    origin: env.ALLOWED_ORIGINS,
    credentials: true,
    maxAge: 86400,
  }));
  app.use(requestLogger());

  // 4b. 健康检查（无需认证）
  const healthRouter = createRouter();
  healthRouter.get("/health", (ctx) => ctx.json(healthCheck.live()));
  healthRouter.get("/health/live", (ctx) => ctx.json(healthCheck.live()));
  healthRouter.get("/health/ready", async (ctx) => {
    const status = await healthCheck.ready();
    return ctx.json(status, status.status === "ok" ? 200 : 503);
  });
  app.use(healthRouter);

  // 4c. OpenAPI 文档（无需认证，必须在系统路由之前注册）
  setupOpenAPI(app, {
    info: { title: "VentoStack API", version: "0.1.0" },
    servers: [{ url: `http://${env.HOST}:${env.PORT}`, description: env.NODE_ENV }],
    jsonPath: "/openapi.json",
    docsPath: "/docs",
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
  });

  // 4d. 系统模块路由
  app.use(system.router);

  // 4e. 监控模块路由
  app.use(monitor.router);

  // 4e. 注册优雅关停回调（框架收到 SIGTERM/SIGINT 时自动调用）
  let shutdownStarted = false;
  app.lifecycle.onBeforeStop(async () => {
    if (shutdownStarted) return;
    shutdownStarted = true;

    // 安全超时：5 秒后强制退出，防止连接未关闭导致进程挂起
    const forceExit = setTimeout(() => {
      logger.info("[shutdown] Force exit (timeout)");
      process.exit(0);
    }, 5000);
    forceExit.unref();

    try {
      logger.info("[shutdown] Closing Redis/cache...");
      await cacheInstance.close();
      logger.info("[shutdown] Redis/cache closed");

      logger.info("[shutdown] Closing database...");
      await database.close();
      logger.info("[shutdown] Database closed");
    } catch (err) {
      logger.info(`[shutdown] Error during shutdown: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  // 4f. 错误处理（必须最后注册）
  app.use(errorHandler({ logger }));

  // =============================================
  // 5. 返回
  // =============================================

  return {
    app,
    infra: {
      database,
      cache: cacheInstance,
    },
  };
}

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

import { resolve } from "node:path";
import { createApp, createRouter, requestId, requestLogger, errorHandler, cors, createTagLogger } from "@ventostack/core";
import type { VentoStackApp } from "@ventostack/core";
import { setupOpenAPI } from "@ventostack/openapi";
import { getDefaultLogger } from "@ventostack/observability";
import type { Logger } from "@ventostack/observability";
import { createAuditLog, createDefaultHealthCheck } from "@ventostack/observability";
import { createOSSModule } from "@ventostack/oss";

import { env } from "./config";
import { createDatabaseConnection, runMigrations, runSeeds } from "./database";
import type { DatabaseContext } from "./database";
import { createCacheInstance, type CacheInstance } from "./cache";
import { createStorageAdapter } from "./storage";
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

  // 1e. 存储 + OSS
  const storage = createStorageAdapter();

  // 1f. 审计日志
  const auditLog = createAuditLog();

  // 1g. 健康检查
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

  // 3a. OSS 模块
  const ossModule = createOSSModule({
    executor,
    storage,
    jwt: auth.jwt,
    jwtSecret: auth.jwtSecret,
    rbac: auth.rbac,
  });

  // 3b. 系统模块（注入 ossService 用于头像上传）
  const system = assembleSystemModule({
    executor,
    cache: cacheInstance.cache,
    auth,
    auditLog,
    ossService: ossModule.services.oss,
  });

  // 3a. 加载权限
  await system.init();

  // 3c. 监控模块
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

  // 4d. 静态文件服务（仅本地存储模式）
  if (env.STORAGE_DRIVER === "local") {
    const staticRouter = createRouter();
    staticRouter.get("/uploads/*", async (ctx) => {
      const url = new URL(ctx.request.url);
      const relativePath = url.pathname.replace(/^\/uploads\/?/, "");
      // Prevent path traversal
      const sanitized = relativePath.replace(/\.\./g, "").replace(/^\/+/, "");
      const basePath = resolve(env.STORAGE_LOCAL_PATH);
      const filePath = resolve(basePath, sanitized);
      if (!filePath.startsWith(basePath)) {
        return new Response("Forbidden", { status: 403 });
      }
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file);
      }
      return new Response("Not Found", { status: 404 });
    });
    app.use(staticRouter);
  }

  // 4e. 系统模块路由
  app.use(system.router);

  // 4f. OSS 模块路由
  app.use(ossModule.router);

  // 4g. 监控模块路由
  app.use(monitor.router);

  // 4h. 注册优雅关停回调（框架收到 SIGTERM/SIGINT 时自动调用）
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

  // 4i. 错误处理（必须最后注册）
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

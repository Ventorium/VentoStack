/**
 * 应用装配工厂（Composition Root）
 *
 * 使用 @ventostack/boot 的 createPlatform() 聚合所有平台模块，
 * 替代手动逐个创建和注册模块的模式。
 */

import { createApp, createRouter, requestId, requestLogger, errorHandler, cors, createTagLogger, createStaticMiddleware, rateLimit } from "@ventostack/core";
import type { Middleware, VentoStackApp } from "@ventostack/core";
import { setupOpenAPI } from "@ventostack/openapi";
import { createAuditLog, createDefaultHealthCheck, createMetrics, createTracer } from "@ventostack/observability";
import { createEventBus, createScheduler } from "@ventostack/events";
import { readTableSchema, listTables } from "@ventostack/database";
import { createPlatform } from "@ventostack/boot";

import { env } from "./config";
import { createDatabaseConnection, runMigrations, runSeeds } from "./database";
import type { DatabaseContext } from "./database";
import { createCacheInstance, type CacheInstance } from "./cache";
import { createStorageAdapter } from "./storage";
import { assembleAuthEngines } from "./auth";

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
  const logger = createTagLogger('app');
  logger.info(`Starting mode: ${env.NODE_ENV}`);

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

  // 1e. 存储适配器
  const storage = createStorageAdapter();

  // 1f. 可观测性
  const auditLog = createAuditLog();

  // 1g. 指标与追踪
  const metrics = createMetrics();
  const tracer = createTracer();

  // 1g. 健康检查
  const healthCheck = createDefaultHealthCheck({
    sql: executor,
    ...(cacheInstance.redisClient ? { redis: cacheInstance.redisClient } : {}),
  });

  // 1h. 事件总线 + 调度器
  const eventBus = createEventBus();
  const scheduler = createScheduler();

  // =============================================
  // 2. 认证引擎层
  // =============================================
  const auth = assembleAuthEngines(cacheInstance.redisClient);

  // =============================================
  // 3. 平台模块聚合（使用 createPlatform）
  // =============================================
  const platform = await createPlatform({
    executor,
    db: database.db,
    readTableSchema,
    listTables,
    cache: cacheInstance.cache,
    jwt: auth.jwt,
    jwtSecret: auth.jwtSecret,
    passwordHasher: auth.passwordHasher,
    totpManager: auth.totp,
    rbac: auth.rbac,
    rowFilter: auth.rowFilter,
    authSessionManager: auth.authSessionManager,
    tokenRefreshManager: auth.tokenRefresh,
    sessionManager: auth.sessionManager,
    multiDeviceManager: auth.deviceManager,
    auditStore: auditLog,
    eventBus,
    healthCheck,
    scheduler,
    storageAdapter: storage,
    rpID: env.WEBAUTHN_RP_ID,
    rpName: env.WEBAUTHN_RP_NAME,
    rpOrigins: env.ALLOWED_ORIGINS,
    // 模块开关：按需启用/禁用
    modules: {
      system: true,
      gen: true,
      monitor: true,
      notification: false, // 需配置 notifyChannels 后启用
      i18n: true,
      workflow: true,
      oss: true,
      scheduler: true,
    },
    // notifyChannels: new Map(), // 配置通知通道后启用 notification 模块
    // jobHandlers: { ... }, // 注册定时任务处理器
  });

  // 初始化所有模块（加载权限、启动定时任务等）
  await platform.init();
  logger.info("Platform modules initialized");

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

  // 4b-2. 指标端点（无需认证）
  const metricsRouter = createRouter();
  metricsRouter.get("/metrics", (ctx) => {
    return ctx.text(metrics.render());
  });
  app.use(metricsRouter);

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
    app.use(createStaticMiddleware({
      root: env.STORAGE_LOCAL_PATH,
      prefix: "/uploads",
    }));
  }

  // 4e. 认证端点限流（防暴力破解）
  const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: "登录尝试过于频繁，请稍后再试",
  });
  const authRateLimitPaths = new Set(["/api/auth/login", "/api/auth/register", "/api/auth/refresh"]);
  const authRateLimitMiddleware: Middleware = (ctx, next) => {
    const pathname = new URL(ctx.request.url).pathname;
    return authRateLimitPaths.has(pathname) ? authRateLimit(ctx, next) : next();
  };
  app.use(authRateLimitMiddleware);

  // 4e. 平台模块路由（createPlatform 自动聚合了所有模块路由）
  app.use(platform.router);

  // 4f. 优雅关停
  let shutdownStarted = false;
  app.lifecycle.onBeforeStop(async () => {
    if (shutdownStarted) return;
    shutdownStarted = true;

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

  // 4g. 错误处理（必须最后注册）
  app.use(errorHandler({ logger }));

  return {
    app,
    infra: {
      database,
      cache: cacheInstance,
    },
  };
}

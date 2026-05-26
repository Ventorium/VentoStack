/**
 * 应用装配工厂（Composition Root）
 *
 * 使用 @ventostack/boot 的 createPlatform() 聚合所有平台模块，
 * 替代手动逐个创建和注册模块的模式。
 */

import { createApp, createRouter, requestId, requestLogger, errorHandler, cors, createTagLogger, createStaticMiddleware, rateLimit } from "@ventostack/core";
import type { Middleware, VentoStackApp } from "@ventostack/core";
import { setupOpenAPI } from "@ventostack/openapi";
import { AsyncLocalStorage } from "node:async_hooks";
import { createAuditLog, createDefaultHealthCheck, createMetrics, createTracer, createTracingMiddleware, wrapExecutorWithTracing, wrapCacheWithTracing, wrapRedisClientWithTracing } from "@ventostack/observability";
import type { SpanContext } from "@ventostack/observability";
import { createEventBus, createScheduler } from "@ventostack/events";
import { readTableSchema, listTables, createDatabase } from "@ventostack/database";
import { createPlatform } from "@ventostack/boot";

import { env } from "./config";
import { createDatabaseConnection, runMigrations, runSeeds } from "./database";
import { createCacheInstance } from "./cache";
import { createStorageAdapter } from "./storage";
import { assembleAuthEngines } from "./auth";
import { serverLogger } from "./logger";

export interface AppContext {
  /** VentoStack 应用实例 */
  app: VentoStackApp;
}

/**
 * 装配并启动应用
 * 失败时抛异常，由入口层处理
 */
export async function buildApp(): Promise<AppContext> {
  // =============================================
  // 1. 基础设施层
  // =============================================
  serverLogger.info(`启动模式: ${env.NODE_ENV}`);

  // 1a. 追踪（需在数据库之前初始化，以便包装 executor）
  const tracer = createTracer();
  const traceStore = new AsyncLocalStorage<SpanContext>();

  // 1b. 数据库（创建连接池 → 包装 executor → 重建 Database）
  const rawConn = createDatabaseConnection();
  const tracingExecutor = wrapExecutorWithTracing(rawConn.executor, tracer, {
    getSpanContext: () => traceStore.getStore(),
  });
  const tracedDb = createDatabase({ executor: tracingExecutor });
  serverLogger.info("数据库已连接");

  // 1c. 运行迁移（使用单连接 executor，不经过 tracing）
  await runMigrations(rawConn.migrationExecutor);

  // 1d. 种子数据（使用原始 executor，启动阶段无请求上下文）
  await runSeeds(rawConn.executor);

  // 1e. 缓存（包装 Redis client 和 Cache，使所有操作可追踪）
  const cacheInstance = await createCacheInstance();
  const getSpanCtx = () => traceStore.getStore();
  const tracedRedisClient = cacheInstance.redisClient
    ? wrapRedisClientWithTracing(cacheInstance.redisClient, tracer, { getSpanContext: getSpanCtx })
    : undefined;
  const tracedCache = wrapCacheWithTracing(cacheInstance.cache, tracer, { getSpanContext: getSpanCtx });

  // 1f. 存储适配器
  const storage = createStorageAdapter();

  // 1g. 可观测性
  const auditLog = createAuditLog();
  const metrics = createMetrics();

  // 1h. 健康检查
  const healthCheck = createDefaultHealthCheck({
    sql: tracingExecutor,
    ...(tracedRedisClient ? { redis: tracedRedisClient } : {}),
  });

  // 1h. 事件总线 + 调度器
  const eventBus = createEventBus();
  const scheduler = createScheduler();

  // =============================================
  // 2. 认证引擎层
  // =============================================
  const auth = assembleAuthEngines(tracedRedisClient);

  // =============================================
  // 3. 平台模块聚合（使用 createPlatform）
  // =============================================
  const platform = await createPlatform({
    executor: tracingExecutor,
    db: tracedDb,
    readTableSchema,
    listTables,
    cache: tracedCache,
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
  serverLogger.info("平台模块已初始化完成");

  // =============================================
  // 4. 应用装配
  // =============================================
  const app = createApp({ port: env.PORT, hostname: env.HOST });

  // 4a. 全局中间件（顺序敏感）
  app.use(requestId());
  app.use(createTracingMiddleware(tracer, { traceStore }));
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
      serverLogger.info("强制退出（超时）");
      process.exit(0);
    }, 5000);
    forceExit.unref();

    try {
      serverLogger.info("正在关闭缓存...");
      await cacheInstance.close();
      serverLogger.info("缓存已关闭");

      serverLogger.info("正在关闭数据库...");
      await rawConn.close();
      serverLogger.info("数据库已关闭");
    } catch (err) {
      serverLogger.error(`关停异常: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  // 4g. 错误处理（必须最后注册）
  app.use(errorHandler({ logger: serverLogger }));

  return { app };
}

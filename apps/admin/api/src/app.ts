/**
 * 应用装配工厂（Composition Root）
 *
 * 使用 @ventostack/boot 的 createPlatform() 聚合所有平台模块，
 * 替代手动逐个创建和注册模块的模式。
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { createPlatform } from "@ventostack/boot";
import {
  cors,
  createApp,
  createRouter,
  createStaticMiddleware,
  createTenantMiddleware,
  errorHandler,
  rateLimit,
  requestId,
  requestLogger,
} from "@ventostack/core";
import type { Middleware, VentoStackApp } from "@ventostack/core";
import { createDatabase, listTables, readTableSchema } from "@ventostack/database";
import { createEventBus, createScheduler } from "@ventostack/events";
import {
  createAuditLog,
  createDefaultHealthCheck,
  createMetrics,
  createTracer,
  createTracingMiddleware,
  wrapCacheWithTracing,
  wrapExecutorWithTracing,
  wrapRedisClientWithTracing,
} from "@ventostack/observability";
import type { SpanContext } from "@ventostack/observability";
import { setupOpenAPI } from "@ventostack/openapi";
import { createInAppChannel } from "@ventostack/notification";

import { assembleAuthEngines } from "./auth";
import { createCacheInstance } from "./cache";
import { env } from "./config";
import { createDatabaseConnection, runMigrations, runSeeds } from "./database";
import { serverLogger } from "./logger";
import { createStorageAdapter } from "./storage";

export interface AppContext {
  /** VentoStack 应用实例（业务端口） */
  app: VentoStackApp;
  /** 管理端口应用实例（ADMIN_PORT=0 时为 null） */
  adminApp: VentoStackApp | null;
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
  const tracedCache = wrapCacheWithTracing(cacheInstance.cache, tracer, {
    getSpanContext: getSpanCtx,
  });

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
      notification: true,
      i18n: true,
      workflow: true,
      oss: true,
      scheduler: true,
    },
    notifyChannels: new Map([["in_app", createInAppChannel()]]),
    // 多租户隔离开关
    tenantEnabled: env.TENANT_ENABLED,
    // jobHandlers: { ... }, // 注册定时任务处理器
  });

  // 初始化所有模块（加载权限、启动定时任务等）
  await platform.init();
  serverLogger.info("平台模块已初始化完成");

  // =============================================
  // 4. 应用装配
  // =============================================
  const app = createApp({ port: env.PORT, hostname: env.HOST });
  let adminAppRef: VentoStackApp | null = null;

  // 4a. 全局中间件（顺序敏感）
  app.use(requestId());
  app.use(createTracingMiddleware(tracer, { traceStore }));
  app.use(
    cors({
      origin: env.ALLOWED_ORIGINS,
      credentials: true,
      maxAge: 86400,
    }),
  );
  app.use(requestLogger());

  // 4b. 判断是否使用独立管理端口
  const useAdminPort = env.ADMIN_PORT > 0;

  // 健康检查路由（用于注册到主应用或管理应用）
  const healthRouter = createRouter();
  healthRouter.get("/health", (ctx) => ctx.json(healthCheck.live()));
  healthRouter.get("/health/live", (ctx) => ctx.json(healthCheck.live()));
  healthRouter.get("/health/ready", async (ctx) => {
    const status = await healthCheck.ready();
    return ctx.json(status, status.status === "ok" ? 200 : 503);
  });

  // 指标路由
  const metricsRouter = createRouter();
  metricsRouter.get("/metrics", (ctx) => {
    return ctx.text(metrics.render());
  });

  if (useAdminPort) {
    // =============================================
    // 4b-1. 独立管理端口模式
    // =============================================
    const adminApp = createApp({ port: env.ADMIN_PORT, hostname: env.ADMIN_HOST });

    adminApp.use(requestId());
    adminApp.use(requestLogger());

    // 健康检查
    adminApp.use(healthRouter);

    // 指标端点
    adminApp.use(metricsRouter);

    // OpenAPI 文档（非生产环境 或 显式开启时注册）
    if (env.NODE_ENV !== "production") {
      setupOpenAPI(adminApp, {
        info: { title: "VentoStack API", version: "0.1.0" },
        servers: [{ url: `http://${env.HOST}:${env.PORT}`, description: env.NODE_ENV }],
        jsonPath: "/openapi.json",
        docsPath: "/docs",
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
      });
    }

    adminApp.use(errorHandler({ logger: serverLogger }));
    adminAppRef = adminApp;
  } else {
    // =============================================
    // 4b-2. 回退模式（ADMIN_PORT=0，所有端点在同一端口）
    // =============================================
    app.use(healthRouter);
    app.use(metricsRouter);

    // OpenAPI 文档（非生产环境注册）
    if (env.NODE_ENV !== "production") {
      setupOpenAPI(app, {
        info: { title: "VentoStack API", version: "0.1.0" },
        servers: [{ url: `http://${env.HOST}:${env.PORT}`, description: env.NODE_ENV }],
        jsonPath: "/openapi.json",
        docsPath: "/docs",
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
      });
    }
  }

  // 4d. 静态文件服务（仅本地存储模式）
  if (env.STORAGE_DRIVER === "local") {
    app.use(
      createStaticMiddleware({
        root: env.STORAGE_LOCAL_PATH,
        prefix: "/uploads",
      }),
    );
  }

  // 4d-2. SPA 前端静态文件服务（生产模式：前端 dist 已复制到 public/）
  if (env.NODE_ENV === "production") {
    const { resolve } = await import("node:path");
    const publicDir = resolve(import.meta.dir, "../public");
    const spaMiddleware: Middleware = async (ctx, next) => {
      const pathname = new URL(ctx.request.url).pathname;
      // API/健康检查/指标/OpenAPI 路径跳过
      if (
        pathname.startsWith("/api/") ||
        pathname.startsWith("/health") ||
        pathname.startsWith("/metrics") ||
        pathname.startsWith("/openapi") ||
        pathname.startsWith("/docs") ||
        pathname.startsWith("/uploads/")
      ) {
        return next();
      }
      // 尝试返回静态文件
      const filePath = resolve(publicDir, pathname.slice(1) || "index.html");
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file);
      }
      // SPA fallback: 返回 index.html
      return new Response(Bun.file(resolve(publicDir, "index.html")));
    };
    app.use(spaMiddleware);
  }

  // 4e. 认证端点限流（防暴力破解）
  const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: "登录尝试过于频繁，请稍后再试",
  });
  const authRateLimitPaths = new Set([
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/refresh",
  ]);
  const authRateLimitMiddleware: Middleware = (ctx, next) => {
    const pathname = new URL(ctx.request.url).pathname;
    return authRateLimitPaths.has(pathname) ? authRateLimit(ctx, next) : next();
  };
  app.use(authRateLimitMiddleware);

  // 4e-1. 多租户中间件（TENANT_ENABLED=true 时注册）
  if (env.TENANT_ENABLED) {
    const { middleware: tenantMiddleware } = createTenantMiddleware({
      strategy: "header",
      headerName: "x-tenant-id",
    });
    app.use(tenantMiddleware);
    serverLogger.info("多租户隔离已启用（strategy: header, x-tenant-id）");
  }

  // 4e. 平台模块路由（createPlatform 自动聚合了所有模块路由）
  app.use(platform.router);

  // 4f. 优雅关停
  let shutdownStarted = false;
  const gracefulShutdown = async () => {
    if (shutdownStarted) return;
    shutdownStarted = true;

    const forceExit = setTimeout(() => {
      serverLogger.info("强制退出（超时）");
      process.exit(0);
    }, 5000);
    forceExit.unref();

    try {
      // 先关闭管理端口（不再接受新请求）
      if (adminAppRef) {
        serverLogger.info("正在关闭管理端口...");
        await adminAppRef.close();
        serverLogger.info("管理端口已关闭");
      }

      serverLogger.info("正在关闭缓存...");
      await cacheInstance.close();
      serverLogger.info("缓存已关闭");

      serverLogger.info("正在关闭数据库...");
      await rawConn.close();
      serverLogger.info("数据库已关闭");
    } catch (err) {
      serverLogger.error(`关停异常: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  app.lifecycle.onBeforeStop(gracefulShutdown);

  // 4g. 错误处理（必须最后注册）
  app.use(errorHandler({ logger: serverLogger }));

  return { app, adminApp: adminAppRef };
}

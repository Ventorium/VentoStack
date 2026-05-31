# Admin API Security Audit
## 1. App Assembly (Composition Root)
```typescript
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
  app.use(
    cors({
      origin: env.ALLOWED_ORIGINS,
      credentials: true,
      maxAge: 86400,
    }),
  );
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
```
## 2. Auth Engine Assembly
```typescript
/**
 * 认证引擎装配工厂
 *
 * 将 @ventostack/auth 的各个独立引擎组合为可注入 system module 的依赖集合。
 * 每个引擎保持独立，不互相耦合——组合发生在工厂函数中。
 *
 * 当传入 Redis 客户端时，Session 和 Token 吊销存储自动切换为 Redis 实现，
 * 支持多实例分布式部署。
 */

import {
  createAuthSessionManager,
  createJWT,
  createMemoryRevocationStore,
  createMemorySessionStore,
  createMultiDeviceManager,
  createPasswordHasher,
  createRBAC,
  createRedisRevocationStore,
  createRedisSessionStore,
  createRowFilter,
  createSessionManager,
  createTOTP,
  createTokenRefresh,
} from "@ventostack/auth";
import type {
  AuthSessionManager,
  JWTManager,
  MultiDeviceManager,
  PasswordHasher,
  RBAC,
  RowFilter,
  SessionManager,
  TOTPManager,
  TokenRefreshManager,
} from "@ventostack/auth";
import type { RedisClientInstance } from "@ventostack/cache";
import { env } from "../config";

export interface AuthEngines {
  jwt: JWTManager;
  jwtSecret: string;
  passwordHasher: PasswordHasher;
  rbac: RBAC;
  rowFilter: RowFilter;
  totp: TOTPManager;
  sessionManager: SessionManager;
  deviceManager: MultiDeviceManager;
  tokenRefresh: TokenRefreshManager;
  authSessionManager: AuthSessionManager;
}

/**
 * 装配完整的认证引擎集合
 * @param redisClient 可选的 Redis 客户端，传入时 Session 和吊销存储使用 Redis 实现
 */
export function assembleAuthEngines(redisClient?: RedisClientInstance): AuthEngines {
  const jwtSecret = env.JWT_SECRET;

  // ---- 核心引擎 ----
  const jwt = createJWT({ secret: jwtSecret });
  const passwordHasher = createPasswordHasher();
  const rbac = createRBAC();
  const rowFilter = createRowFilter();

  // ---- 双因素认证 ----
  const totp = createTOTP({ algorithm: "SHA-256" });

  // ---- Session（Redis 优先，内存兜底） ----
  const sessionStore = redisClient
    ? createRedisSessionStore({ client: redisClient })
    : createMemorySessionStore();
  const sessionManager = createSessionManager(sessionStore, {
    ttl: env.SESSION_TTL_SECONDS,
  });

  // ---- 多设备管理 ----
  const deviceManager = createMultiDeviceManager({
    maxDevices: env.MAX_DEVICES_PER_USER,
    overflowStrategy: "kick-oldest",
  });

  // ---- Token 刷新与吊销（Redis 优先，内存兜底） ----
  const revocationStore = redisClient
    ? createRedisRevocationStore(redisClient)
    : createMemoryRevocationStore();
  const tokenRefresh = createTokenRefresh(jwt, { revocationStore });

  // ---- 统一认证会话管理 ----
  const authSessionManager = createAuthSessionManager({
    sessionManager,
    deviceManager,
    tokenRefresh,
    jwt,
    jwtSecret,
  });

  return {
    jwt,
    jwtSecret,
    passwordHasher,
    rbac,
    rowFilter,
    totp,
    sessionManager,
    deviceManager,
    tokenRefresh,
    authSessionManager,
  };
}
```
## 3. Environment Config
```typescript
/**
 * 环境变量定义、读取与校验
 *
 * 使用 @ventostack/core 的 createConfig 统一管理配置，
 * 支持类型推导、默认值、必填校验、枚举约束和敏感字段脱敏。
 */

import { createConfig } from "@ventostack/core";

const rawConfig = createConfig(
  {
    NODE_ENV: {
      type: "string",
      env: "NODE_ENV",
      default: "development",
      options: ["development", "production", "test"],
    },
    PORT: { type: "number", env: "PORT", default: 9320 },
    HOST: { type: "string", env: "HOST", default: "0.0.0.0" },
    DATABASE_URL: {
      type: "string",
      env: "DATABASE_URL",
      required: true,
      sensitive: true,
    },
    JWT_SECRET: {
      type: "string",
      env: "JWT_SECRET",
      required: true,
      sensitive: true,
    },
    ALLOWED_ORIGINS: {
      type: "string",
      env: "ALLOWED_ORIGINS",
      default: "http://localhost:9321",
    },
    LOG_LEVEL: {
      type: "string",
      env: "LOG_LEVEL",
      default: "info",
      options: ["debug", "info", "warn", "error"],
    },
    CACHE_DRIVER: {
      type: "string",
      env: "CACHE_DRIVER",
      default: "memory",
      options: ["memory", "redis"],
    },
    REDIS_URL: { type: "string", env: "REDIS_URL" },
    DB_POOL_SIZE: {
      type: "number",
      env: "DB_POOL_SIZE",
      default: 10,
    },
    SESSION_TTL_SECONDS: {
      type: "number",
      env: "SESSION_TTL_SECONDS",
      default: 1800,
    },
    MAX_DEVICES_PER_USER: {
      type: "number",
      env: "MAX_DEVICES_PER_USER",
      default: 5,
    },
    BCRYPT_COST: { type: "number", env: "BCRYPT_COST", default: 10 },
    WEBAUTHN_RP_ID: { type: "string", env: "WEBAUTHN_RP_ID", default: "localhost" },
    WEBAUTHN_RP_NAME: { type: "string", env: "WEBAUTHN_RP_NAME", default: "VentoStack Admin" },
    // ---- Storage ----
    STORAGE_DRIVER: {
      type: "string",
      env: "STORAGE_DRIVER",
      default: "local",
      options: ["local", "s3"],
    },
    STORAGE_LOCAL_PATH: {
      type: "string",
      env: "STORAGE_LOCAL_PATH",
      default: "./uploads",
    },
    STORAGE_LOCAL_BASE_URL: {
      type: "string",
      env: "STORAGE_LOCAL_BASE_URL",
      default: "/uploads",
    },
    S3_ENDPOINT: { type: "string", env: "S3_ENDPOINT" },
    S3_BUCKET: { type: "string", env: "S3_BUCKET" },
    S3_ACCESS_KEY_ID: {
      type: "string",
      env: "S3_ACCESS_KEY_ID",
      sensitive: true,
    },
    S3_SECRET_ACCESS_KEY: {
      type: "string",
      env: "S3_SECRET_ACCESS_KEY",
      sensitive: true,
    },
    S3_REGION: { type: "string", env: "S3_REGION", default: "auto" },
    S3_PUBLIC_BASE_URL: { type: "string", env: "S3_PUBLIC_BASE_URL" },
  },
  process.env,
);

// 跨字段校验
if (rawConfig.CACHE_DRIVER === "redis" && !rawConfig.REDIS_URL) {
  throw new Error("REDIS_URL is required when CACHE_DRIVER=redis");
}
if (rawConfig.STORAGE_DRIVER === "s3") {
  if (!rawConfig.S3_BUCKET) throw new Error("S3_BUCKET is required when STORAGE_DRIVER=s3");
  if (!rawConfig.S3_ACCESS_KEY_ID)
    throw new Error("S3_ACCESS_KEY_ID is required when STORAGE_DRIVER=s3");
  if (!rawConfig.S3_SECRET_ACCESS_KEY)
    throw new Error("S3_SECRET_ACCESS_KEY is required when STORAGE_DRIVER=s3");
}

// ALLOWED_ORIGINS: 逗号分隔 → string[]
export const env = {
  ...rawConfig,
  ALLOWED_ORIGINS: rawConfig.ALLOWED_ORIGINS.split(",").map((s) => s.trim()),
};

export type EnvVars = typeof env;
```
## 4. Entry Point
```typescript
#!/usr/bin/env bun
/**
 * @ventostack/backend — 管理后台服务端
 *
 * 职责仅限于：生命周期管理、顶层错误边界。
 * 优雅关停由框架 createApp 内置的 SIGTERM/SIGINT 处理。
 * 业务装配逻辑全部委托给 app.ts（Composition Root）。
 *
 * 启动方式：
 *   bun run src/index.ts                          # 开发模式
 *   NODE_ENV=production bun run src/index.ts      # 生产模式
 *
 * 环境变量参考 .env.example
 */

import { createTagLogger } from "@ventostack/core";
import { type AppContext, buildApp } from "./app";
import { env } from "./config";
import { serverLogger } from "./logger";

let appCtx: AppContext | null = null;

async function main(): Promise<void> {
  appCtx = await buildApp();

  // 框架 createApp.listen() 内部注册了 SIGTERM/SIGINT 处理：
  // 1. 设置 isClosing=true，新请求返回 503
  // 2. 等待活跃请求最多 30 秒
  // 3. 执行 lifecycle.onBeforeStop()
  // 4. 关闭 HTTP 服务
  // 5. process.exit(0)
  await appCtx.app.listen();

  // 后端启动后自动生成前端 SDK 类型（仅开发模式）
  if (env.NODE_ENV !== "production") {
    const genLog = createTagLogger("gen:sdk");
    const webDir = import.meta.dir.replace("/apps/admin/api/src", "/apps/admin/web");
    Bun.spawn({
      cmd: ["bun", "run", "gen:sdk"],
      cwd: webDir,
      stdout: "pipe",
      stderr: "pipe",
      onExit(subprocess, exitCode) {
        if (exitCode === 0) {
          genLog.info("前端 SDK 类型已更新");
        } else {
          genLog.warn(`生成失败 (exit code ${exitCode})`);
        }
      },
    });
  }
}

// ===============================================
// 顶层错误边界 — 捕获启动阶段的不可恢复错误
// ===============================================

main().catch((err) => {
  serverLogger.error("Startup failed:");
  console.error(err);
  process.exit(1);
});
```

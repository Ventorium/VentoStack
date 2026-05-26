// @ventostack/core - 核心框架层
// 提供 Router、Context、Middleware、Lifecycle、Config、Error handling 等核心能力

// ========== 应用入口 ==========
export { createApp } from "./app";
export type { VentoStackApp, AppConfig, AppUrl } from "./app";

// ========== 路由系统 ==========
export { createRouter, defineRouteConfig, parseRoutePath } from "./router";
export type {
  Router,
  RouteDefinition,
  RouteHandler,
  CompiledRoutes,
  ResourceHandlers,
  ParsedParam,
  ParsedRoute,
  InferParams,
} from "./router";

// ========== 请求上下文 ==========
export { createContext } from "./context";
export type { Context } from "./context";

// ========== 客户端 IP ==========
export { getClientIPFromRequest } from "./client-ip";
export type { ClientIPOptions } from "./client-ip";

// ========== 中间件模型 ==========
export type { Middleware, NextFunction } from "./middleware";

// ========== 配置系统 ==========
export { createConfig, loadConfig, parseArgs, safeConfig, securityPrecheck, sanitizeConfig } from "./config";
export type {
  ConfigSchema,
  ConfigFieldDef,
  ConfigValue,
  ConfigLoaderOptions,
  SecurityCheckOptions,
  SecurityCheckResult,
} from "./config";

// ========== 错误体系 ==========
export {
  VentoStackError,
  ClientError,
  ServerError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
} from "./errors";

// ========== 生命周期管理 ==========
export type { LifecycleHook, Lifecycle } from "./lifecycle";

// ========== 插件接口 ==========
export type { Plugin } from "./plugin";

// ========== 校验器 ==========
export { validate, validateBody, validateQuery } from "./validator";
export type {
  FieldType,
  FieldRule,
  Schema,
  ValidationResult,
} from "./validator";

// ========== 安全中间件：CORS ==========
export { cors } from "./middlewares/cors";
export type { CorsOptions } from "./middlewares/cors";

// ========== 多租户中间件 ==========
export { createTenantMiddleware } from "./middlewares/tenant";
export type {
  TenantContext,
  TenantResolverOptions,
  TenantMiddlewareResult,
} from "./middlewares/tenant";

// ========== 熔断器 ==========
export { createCircuitBreaker, createCircuitOpenError } from "./circuit-breaker";
export type {
  CircuitState,
  CircuitBreakerOptions,
  CircuitBreaker,
} from "./circuit-breaker";

// ========== 限流中间件 ==========
export { rateLimit, createMemoryRateLimitStore, createRedisRateLimitStore } from "./middlewares/rate-limit";
export type {
  RateLimitOptions,
  RateLimitStore,
  RedisClientLike,
  RedisRateLimitStoreOptions,
} from "./middlewares/rate-limit";

// ========== 超时中间件 ==========
export { timeout } from "./middlewares/timeout";
export type { TimeoutOptions } from "./middlewares/timeout";

// ========== 请求 ID 中间件 ==========
export { requestId } from "./middlewares/request-id";

// ========== 请求日志中间件 ==========
export { requestLogger } from "./middlewares/logger";
export type { LoggerLike, RequestLoggerOptions } from "./middlewares/logger";

// ========== 错误处理中间件 ==========
export { errorHandler } from "./middlewares/error-handler";
export type { ErrorHandlerOptions } from "./middlewares/error-handler";

// ========== CSRF 防护中间件 ==========
export { csrf } from "./middlewares/csrf";
export type { CSRFOptions } from "./middlewares/csrf";

// ========== SSRF 防护中间件 ==========
export { createSSRFGuard } from "./middlewares/ssrf";
export type { SSRFOptions } from "./middlewares/ssrf";

// ========== 上传校验中间件 ==========
export { createUploadValidator, sanitizeFilename } from "./middlewares/upload";
export type {
  UploadOptions,
  UploadResult,
  UploadFileInfo,
} from "./middlewares/upload";

// ========== HMAC 签名校验中间件 ==========
export { createHMACSigner } from "./middlewares/hmac";
export type { HMACOptions } from "./middlewares/hmac";

// ========== 统一响应封装 ==========
export { success, fail, paginated } from "./response";
export type { ApiResponse, PaginatedData } from "./response";

// ========== 模块系统 ==========
export { defineModule, createModuleRegistry } from "./module";
export type { ModuleDefinition, ModuleRegistry } from "./module";

// ========== WebSocket 路由 ==========
export { createWebSocketRouter } from "./websocket";
export type { WSRoute, WSConnection, WebSocketRouter } from "./websocket";

// ========== Schema 类型与推导 ==========
export {
  coerceAndValidate,
  coerceAndValidateJSONBody,
  coerceAndValidateFormBody,
  coerceAndValidateFormDataBody,
  isRouteResponseConfig,
  isSchemaField,
} from "./schema-types";
export type {
  SchemaFieldType,
  SchemaField,
  RouteResponseConfig,
  RouteResponseDefinition,
  RouteSchemaConfig,
  RouteOpenAPIConfig,
  InferFieldType,
  InferSchema,
  InferResponseType,
} from "./schema-types";

// ========== 参数类型约束 ==========
export { paramTypes, isValidParamType } from "./param-constraint";
export type {
  ParamType,
  ParamTypeMap,
  ParamTypeDef,
} from "./param-constraint";

// ========== 内容协商 ==========
export { negotiate } from "./content-negotiation";
export type { NegotiationResult } from "./content-negotiation";

// ========== 功能开关 ==========
export { createFeatureToggle } from "./feature-toggle";
export type { FeatureFlag, FeatureToggle } from "./feature-toggle";

// ========== Hook 注册表 ==========
export { createHookRegistry } from "./hooks";
export type { HookCallback, HookRegistry } from "./hooks";

// ========== Worker 线程池 ==========
export { createWorkerPool } from "./worker-pool";
export type { WorkerPool, WorkerPoolOptions, WorkerTask, WorkerResult } from "./worker-pool";

// ========== XSS 防护中间件 ==========
export { xssProtection, escapeHTML, detectXSS } from "./middlewares/xss";
export type { XSSOptions } from "./middlewares/xss";

// ========== IP 过滤中间件 ==========
export { ipFilter } from "./middlewares/ip-filter";
export type { IPFilterOptions } from "./middlewares/ip-filter";

// ========== HTTPS 强制中间件 ==========
export { httpsEnforce } from "./middlewares/https";
export type { HTTPSOptions } from "./middlewares/https";

// ========== 自动绑定 ==========
export { bindJSON, bindForm, bindQuery } from "./auto-bind";
export type { BindOptions, BindResult } from "./auto-bind";

// ========== 拦截器与管道 ==========
export { createPipeline } from "./interceptor";
export type { Interceptor, Filter, Pipeline } from "./interceptor";

// ========== 资源池管理 ==========
export { createPoolManager } from "./pool-manager";
export type { PoolManager, Disposable } from "./pool-manager";

// ========== 实例协调器 ==========
export { createInstanceCoordinator } from "./instance-coordinator";
export type { InstanceCoordinator, InstanceState } from "./instance-coordinator";

// ========== gRPC 服务抽象 ==========
export { createGRPCServer, GRPCError, GRPCStatusCode } from "./grpc";
export type {
  GRPCServer,
  ServiceDefinition,
  MethodDefinition,
  GRPCHandler,
  GRPCContext,
  GRPCStatus,
} from "./grpc";

// ========== 内部 RPC ==========
export { createRPCRouter, createRPCClient } from "./rpc";
export type { RPCRouter, RPCClient, RPCMethod } from "./rpc";

// ========== 热重启 ==========
export { createHotRestart } from "./hot-restart";
export type { HotRestart, HotRestartOptions } from "./hot-restart";

// ========== 内存监控 ==========
export { createMemoryController } from "./memory";
export type { MemoryController, MemoryInfo, MemoryControlOptions } from "./memory";

// ========== 插件沙箱 ==========
export { createPluginSandbox } from "./plugin-sandbox";
export type { PluginSandbox, PluginInfo, PluginInitResult, IsolatedPlugin } from "./plugin-sandbox";

// ========== 插件注册表 ==========
export { createPluginRegistry } from "./plugin-registry";
export type { PluginRegistry, PluginRegistryEntry, PluginManifest } from "./plugin-registry";

// ========== YAML 配置 ==========
export { parseYAML, stringifyYAML, loadYAMLConfig } from "./yaml-config";

// ========== 配置热重载 ==========
export { createConfigWatcher } from "./config-watch";
export type { ConfigWatcher, ConfigWatcherOptions } from "./config-watch";

// ========== 配置加密 ==========
export { createConfigEncryptor } from "./config-encryption";
export type { ConfigEncryptor, ConfigEncryptionOptions } from "./config-encryption";

// ========== A/B 测试 ==========
export { createABTestManager } from "./ab-testing";
export type { ABTestManager, ABTest, ABTestVariant, ABTestResult } from "./ab-testing";

// ========== 12-Factor 配置 ==========
export { loadTwelveFactorConfig, validateEnvVars } from "./twelve-factor";
export type { TwelveFactorConfig, TwelveFactorResult } from "./twelve-factor";

// ========== 终端颜色 ==========
export { ansi, RESET, COLORS } from "./color";

// ========== 标签日志 ==========
export { createTagLogger } from "./tag-log";
export type { TagLogger } from "./tag-log";

// ========== 工具函数 ==========
export { generateId, generateUUID } from "./utils/generate-id";

// 静态文件服务
export { createStaticMiddleware } from "./middlewares/static";
export type { StaticOptions } from "./middlewares/static";

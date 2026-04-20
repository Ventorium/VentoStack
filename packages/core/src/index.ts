// @aeron/core - 核心框架层
// Router, Context, Middleware, Lifecycle, Config, Error handling

export { createApp } from "./app";
export type { AeronApp, AppConfig } from "./app";

export { createRouter } from "./router";
export type {
  Router,
  RouteDefinition,
  RouteHandler,
  CompiledRoutes,
  ResourceHandlers,
} from "./router";

export { createContext } from "./context";
export type { Context } from "./context";

export { compose } from "./middleware";
export type { Middleware, NextFunction } from "./middleware";

export { createConfig, loadConfig, parseArgs, securityPrecheck, sanitizeConfig } from "./config";
export type {
  ConfigSchema,
  ConfigFieldDef,
  ConfigValue,
  ConfigLoaderOptions,
  SecurityCheckOptions,
  SecurityCheckResult,
} from "./config";

export {
  AeronError,
  ClientError,
  ServerError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
} from "./errors";

export { createLifecycle } from "./lifecycle";
export type { LifecycleHook, Lifecycle } from "./lifecycle";

export type { Plugin } from "./plugin";

export { validate, validateBody, validateQuery } from "./validator";
export type {
  FieldType,
  FieldRule,
  Schema,
  ValidationResult,
} from "./validator";

export { cors } from "./middlewares/cors";
export type { CorsOptions } from "./middlewares/cors";

export { createTenantMiddleware } from "./middlewares/tenant";
export type {
  TenantContext,
  TenantResolverOptions,
  TenantMiddlewareResult,
} from "./middlewares/tenant";

export { createCircuitBreaker, createCircuitOpenError } from "./circuit-breaker";
export type {
  CircuitState,
  CircuitBreakerOptions,
  CircuitBreaker,
} from "./circuit-breaker";

export { rateLimit, createMemoryRateLimitStore } from "./middlewares/rate-limit";
export type {
  RateLimitOptions,
  RateLimitStore,
} from "./middlewares/rate-limit";

export { timeout } from "./middlewares/timeout";
export type { TimeoutOptions } from "./middlewares/timeout";

export { requestId } from "./middlewares/request-id";

export { csrf } from "./middlewares/csrf";
export type { CSRFOptions } from "./middlewares/csrf";

export { createSSRFGuard } from "./middlewares/ssrf";
export type { SSRFOptions } from "./middlewares/ssrf";

export { createUploadValidator, sanitizeFilename } from "./middlewares/upload";
export type {
  UploadOptions,
  UploadResult,
  UploadFileInfo,
} from "./middlewares/upload";

export { createHMACSigner } from "./middlewares/hmac";
export type { HMACOptions } from "./middlewares/hmac";

export { success, fail, paginated } from "./response";
export type { ApiResponse, PaginatedData } from "./response";

export { defineModule, createModuleRegistry } from "./module";
export type { ModuleDefinition, ModuleRegistry } from "./module";

export { createWebSocketRouter } from "./websocket";
export type { WSRoute, WSConnection, WebSocketRouter } from "./websocket";

export { createParamValidator, paramConstraints } from "./param-constraint";
export type { ParamConstraint, RouteParamValidator } from "./param-constraint";

export { negotiate } from "./content-negotiation";
export type { NegotiationResult } from "./content-negotiation";

export { createFeatureToggle } from "./feature-toggle";
export type { FeatureFlag, FeatureToggle } from "./feature-toggle";

export { createHookRegistry } from "./hooks";
export type { HookCallback, HookRegistry } from "./hooks";

export { createWorkerPool } from "./worker-pool";
export type { WorkerPool, WorkerPoolOptions, WorkerTask, WorkerResult } from "./worker-pool";

export { xssProtection, escapeHTML, detectXSS } from "./middlewares/xss";
export type { XSSOptions } from "./middlewares/xss";

export { ipFilter } from "./middlewares/ip-filter";
export type { IPFilterOptions } from "./middlewares/ip-filter";

export { httpsEnforce } from "./middlewares/https";
export type { HTTPSOptions } from "./middlewares/https";

export { createAutoBinder } from "./auto-bind";
export type { AutoBinder, AutoBindOptions, BindableRoute } from "./auto-bind";

export { createInterceptorChain } from "./interceptor";
export type { Interceptor, Filter, InterceptorChain } from "./interceptor";

export { createPoolManager } from "./pool-manager";
export type { PoolManager, PoolConfig, PoolStats } from "./pool-manager";

export { createInstanceCoordinator } from "./instance-coordinator";
export type { InstanceCoordinator, InstanceInfo } from "./instance-coordinator";

export { createGRPCRouter } from "./grpc";
export type { GRPCRouter, GRPCService, GRPCMethod } from "./grpc";

export { createRPCRouter, createRPCClient } from "./rpc";
export type { RPCRouter, RPCClient, RPCMethod } from "./rpc";

export { createHotRestart } from "./hot-restart";
export type { HotRestart, HotRestartOptions } from "./hot-restart";

export { createMemoryManager } from "./memory";
export type { MemoryManager, MemoryStats, MemoryThresholds } from "./memory";

export { createPluginSandbox } from "./plugin-sandbox";
export type { PluginSandbox, SandboxOptions, SandboxResult } from "./plugin-sandbox";

export { createPluginRegistry } from "./plugin-registry";
export type { PluginRegistry, PluginManifest, PluginEntry } from "./plugin-registry";

export { createYamlConfig, parseYaml } from "./yaml-config";
export type { YamlConfigOptions } from "./yaml-config";

export { createConfigWatcher } from "./config-watch";
export type { ConfigWatcher, ConfigWatchOptions, ConfigChangeEvent } from "./config-watch";

export { createConfigEncryption } from "./config-encryption";
export type { ConfigEncryption, EncryptionOptions } from "./config-encryption";

export { createABTesting } from "./ab-testing";
export type { ABTesting, Experiment, ABTestingOptions } from "./ab-testing";

export { createTwelveFactorConfig, validateTwelveFactor } from "./twelve-factor";
export type { TwelveFactorConfig, TwelveFactorValidation } from "./twelve-factor";

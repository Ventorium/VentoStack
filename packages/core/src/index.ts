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

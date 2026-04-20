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
} from "./router";

export { createContext } from "./context";
export type { Context } from "./context";

export { compose } from "./middleware";
export type { Middleware, NextFunction } from "./middleware";

export { createConfig } from "./config";
export type { ConfigSchema, ConfigFieldDef, ConfigValue } from "./config";

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

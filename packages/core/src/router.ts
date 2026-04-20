// @aeron/core - 路由系统

import { createContext, type Context } from "./context";
import { compose, type Middleware } from "./middleware";

export type RouteHandler = (ctx: Context) => Promise<Response> | Response;

type BunRouteHandler = (req: Request) => Response | Promise<Response>;

export type CompiledRoutes = Record<
  string,
  BunRouteHandler | Record<string, BunRouteHandler>
>;

export interface RouteDefinition {
  method: string;
  path: string;
  handler: RouteHandler;
  middleware: Middleware[];
}

export interface ResourceHandlers {
  index?: RouteHandler;
  show?: RouteHandler;
  create?: RouteHandler;
  update?: RouteHandler;
  destroy?: RouteHandler;
}

export interface Router {
  get(path: string, handler: RouteHandler, ...middleware: Middleware[]): Router;
  post(path: string, handler: RouteHandler, ...middleware: Middleware[]): Router;
  put(path: string, handler: RouteHandler, ...middleware: Middleware[]): Router;
  patch(
    path: string,
    handler: RouteHandler,
    ...middleware: Middleware[]
  ): Router;
  delete(
    path: string,
    handler: RouteHandler,
    ...middleware: Middleware[]
  ): Router;
  group(
    prefix: string,
    callback: (group: Router) => void,
    ...middleware: Middleware[]
  ): Router;
  use(...middleware: Middleware[]): Router;
  resource(
    prefix: string,
    handlers: ResourceHandlers,
    ...middleware: Middleware[]
  ): Router;
  namedRoute(
    name: string,
    method: string,
    path: string,
    handler: RouteHandler,
    ...middleware: Middleware[]
  ): Router;
  url(name: string, params?: Record<string, string>): string;
  routes(): readonly RouteDefinition[];
  compile(globalMiddleware?: Middleware[]): CompiledRoutes;
}

export function createRouter(): Router {
  const routeDefs: RouteDefinition[] = [];
  const routerMiddleware: Middleware[] = [];
  const namedRoutes = new Map<string, string>();

  function addRoute(
    method: string,
    path: string,
    handler: RouteHandler,
    middleware: Middleware[],
  ): Router {
    routeDefs.push({
      method: method.toUpperCase(),
      path,
      handler,
      middleware,
    });
    return router;
  }

  const router: Router = {
    get: (path, handler, ...mw) => addRoute("GET", path, handler, mw),
    post: (path, handler, ...mw) => addRoute("POST", path, handler, mw),
    put: (path, handler, ...mw) => addRoute("PUT", path, handler, mw),
    patch: (path, handler, ...mw) => addRoute("PATCH", path, handler, mw),
    delete: (path, handler, ...mw) => addRoute("DELETE", path, handler, mw),

    group(prefix, callback, ...groupMiddleware) {
      const subRouter = createRouter();
      callback(subRouter);
      for (const route of subRouter.routes()) {
        routeDefs.push({
          ...route,
          path: prefix + route.path,
          middleware: [...groupMiddleware, ...route.middleware],
        });
      }
      return router;
    },

    use(...mw) {
      routerMiddleware.push(...mw);
      return router;
    },

    resource(prefix, handlers, ...mw) {
      if (handlers.index) {
        addRoute("GET", prefix, handlers.index, mw);
      }
      if (handlers.create) {
        addRoute("POST", prefix, handlers.create, mw);
      }
      if (handlers.show) {
        addRoute("GET", `${prefix}/:id`, handlers.show, mw);
      }
      if (handlers.update) {
        addRoute("PUT", `${prefix}/:id`, handlers.update, mw);
      }
      if (handlers.destroy) {
        addRoute("DELETE", `${prefix}/:id`, handlers.destroy, mw);
      }
      return router;
    },

    namedRoute(name, method, path, handler, ...mw) {
      if (namedRoutes.has(name)) {
        throw new Error(`Route name "${name}" is already registered`);
      }
      namedRoutes.set(name, path);
      addRoute(method.toUpperCase(), path, handler, mw);
      return router;
    },

    url(name, params) {
      const path = namedRoutes.get(name);
      if (path === undefined) {
        throw new Error(`Route name "${name}" not found`);
      }
      if (!params) {
        return path;
      }
      let result = path;
      for (const [key, value] of Object.entries(params)) {
        result = result.replace(`:${key}`, value);
      }
      return result;
    },

    routes(): readonly RouteDefinition[] {
      return routeDefs.map((route) => ({
        ...route,
        middleware: [...routerMiddleware, ...route.middleware],
      }));
    },

    compile(globalMiddleware: Middleware[] = []): CompiledRoutes {
      const finalRoutes = router.routes();

      // 路由冲突检测
      const seen = new Set<string>();
      for (const route of finalRoutes) {
        const key = `${route.method} ${route.path || "/"}`;
        if (seen.has(key)) {
          throw new Error(
            `Duplicate route detected: ${route.method} ${route.path || "/"}`,
          );
        }
        seen.add(key);
      }

      const compiled: Record<string, Record<string, BunRouteHandler>> = {};

      for (const route of finalRoutes) {
        const path = route.path || "/";
        if (!compiled[path]) {
          compiled[path] = {};
        }

        const allMiddleware = [...globalMiddleware, ...route.middleware];

        compiled[path]![route.method] = (req: Request): Promise<Response> => {
          const params =
            (req as Request & { params?: Record<string, string> }).params ?? {};
          const ctx = createContext(req, params);

          if (allMiddleware.length === 0) {
            return Promise.resolve(route.handler(ctx));
          }

          return compose(allMiddleware)(ctx, () =>
            Promise.resolve(route.handler(ctx)),
          );
        };
      }

      return compiled as CompiledRoutes;
    },
  };

  return router;
}

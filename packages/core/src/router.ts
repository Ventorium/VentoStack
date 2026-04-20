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
  routes(): readonly RouteDefinition[];
  compile(globalMiddleware?: Middleware[]): CompiledRoutes;
}

export function createRouter(): Router {
  const routeDefs: RouteDefinition[] = [];
  const routerMiddleware: Middleware[] = [];

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

    routes(): readonly RouteDefinition[] {
      return routeDefs.map((route) => ({
        ...route,
        middleware: [...routerMiddleware, ...route.middleware],
      }));
    },

    compile(globalMiddleware: Middleware[] = []): CompiledRoutes {
      const finalRoutes = router.routes();
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

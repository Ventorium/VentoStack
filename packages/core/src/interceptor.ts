// @aeron/core - Interceptor / Filter 三层管线模型

import type { Context } from "./context";
import type { Middleware, NextFunction } from "./middleware";

/**
 * Interceptor: 拦截器，可在 handler 前后修改 Context 或 Response
 * 类似 Middleware 但更细粒度：before + after 分离
 */
export interface Interceptor {
  name: string;
  /** handler 执行前，返回 Response 即短路 */
  before?(ctx: Context): Promise<Response | void> | Response | void;
  /** handler 执行后，可修改 Response */
  after?(ctx: Context, response: Response): Promise<Response> | Response;
}

/**
 * Filter: 过滤器，决定请求是否可继续（纯布尔判断）
 * 返回 false 或 Response 即拒绝
 */
export interface Filter {
  name: string;
  apply(ctx: Context): Promise<boolean | Response> | boolean | Response;
}

export interface Pipeline {
  addFilter(filter: Filter): void;
  addInterceptor(interceptor: Interceptor): void;
  addMiddleware(middleware: Middleware): void;
  toMiddleware(): Middleware;
}

/**
 * 创建三层管线：Filter → Interceptor(before) → Middleware → Handler → Interceptor(after)
 */
export function createPipeline(): Pipeline {
  const filters: Filter[] = [];
  const interceptors: Interceptor[] = [];
  const middlewares: Middleware[] = [];

  return {
    addFilter(filter: Filter): void {
      filters.push(filter);
    },

    addInterceptor(interceptor: Interceptor): void {
      interceptors.push(interceptor);
    },

    addMiddleware(middleware: Middleware): void {
      middlewares.push(middleware);
    },

    toMiddleware(): Middleware {
      return async (ctx: Context, next: NextFunction): Promise<Response> => {
        // 1. 执行 Filters
        for (const filter of filters) {
          const result = await filter.apply(ctx);
          if (result instanceof Response) return result;
          if (result === false) {
            return new Response("Forbidden", { status: 403 });
          }
        }

        // 2. 执行 Interceptor before
        for (const interceptor of interceptors) {
          if (interceptor.before) {
            const result = await interceptor.before(ctx);
            if (result instanceof Response) return result;
          }
        }

        // 3. 执行 Middleware 链 + Handler
        let response: Response;
        if (middlewares.length === 0) {
          response = await next();
        } else {
          let idx = 0;
          const runMiddleware = async (): Promise<Response> => {
            if (idx >= middlewares.length) {
              return next();
            }
            const mw = middlewares[idx]!;
            idx++;
            return mw(ctx, runMiddleware);
          };
          response = await runMiddleware();
        }

        // 4. 执行 Interceptor after（逆序）
        for (let i = interceptors.length - 1; i >= 0; i--) {
          const interceptor = interceptors[i]!;
          if (interceptor.after) {
            response = await interceptor.after(ctx, response);
          }
        }

        return response;
      };
    },
  };
}

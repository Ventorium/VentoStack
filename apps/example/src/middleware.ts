// 示例中间件
import type { Middleware } from "@aeron/core";
import type { Logger } from "@aeron/observability";

/**
 * 请求日志中间件：记录请求方法、路径、状态码、耗时
 */
export function requestLogger(logger: Logger): Middleware {
  return async (ctx, next) => {
    const start = performance.now();
    const response = await next();
    const duration = (performance.now() - start).toFixed(2);

    logger.info("request", {
      method: ctx.method,
      path: ctx.path,
      status: response.status,
      duration: `${duration}ms`,
    });

    return response;
  };
}

/**
 * 全局错误处理中间件：捕获未处理的异常，返回统一错误格式
 */
export function errorHandler(logger: Logger): Middleware {
  return async (ctx, next) => {
    try {
      return await next();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";

      logger.error("unhandled error", {
        method: ctx.method,
        path: ctx.path,
        error: message,
      });

      return ctx.json(
        { error: "INTERNAL_ERROR", message: "Internal Server Error" },
        500,
      );
    }
  };
}

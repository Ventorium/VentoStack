/**
 * 全局错误处理中间件
 *
 * 不直接使用 core 的 errorHandler，而是自定义以输出结构化日志。
 */

import type { Middleware } from "@ventostack/core";
import { VentoStackError } from "@ventostack/core";
import { env } from "../config";
import type { Logger } from "../observability";

const JSON_HEADERS = { "Content-Type": "application/json" };

interface ErrorHandlerOptions {
  logger: Logger;
}

/**
 * 全局错误处理中间件
 * 包裹所有下游中间件和路由，捕获未处理异常并返回统一 JSON 错误响应。
 */
export function createErrorHandlerMiddleware(options: ErrorHandlerOptions): Middleware {
  const { logger } = options;

  return (ctx, next) => {
    try {
      const result = next();
      if (result instanceof Promise) {
        return result.catch((err) => handleError(ctx.request, err));
      }
      return result;
    } catch (err) {
      return handleError(ctx.request, err);
    }
  };
}

function handleError(request: Request, error: unknown): Response {
  // ---- 框架级错误（已分类） ----
  if (error instanceof VentoStackError) {
    return new Response(
      JSON.stringify({
        code: error.code,
        message: error.message,
        data: null,
      }),
      { status: error.code, headers: JSON_HEADERS },
    );
  }

  // ---- 运行时错误 ----
  const message = error instanceof Error ? error.message : "Internal Server Error";
  const stack = error instanceof Error ? error.stack : undefined;

  // 生产环境不暴露堆栈
  if (env.NODE_ENV === "production") {
    return new Response(
      JSON.stringify({ code: 500, message: "Internal Server Error", data: null }),
      { status: 500, headers: JSON_HEADERS },
    );
  }

  // 开发环境暴露详情
  return new Response(
    JSON.stringify({
      code: 500,
      message,
      data: null,
      ...(stack ? { stack: stack.split("\n").slice(0, 6).join("\n") } : {}),
    }),
    { status: 500, headers: JSON_HEADERS },
  );
}

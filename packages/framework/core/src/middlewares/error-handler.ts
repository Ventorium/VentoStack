// @ventostack/core - 内置错误处理中间件

import { VentoStackError, ValidationError } from "../errors";
import type { Context } from "../context";
import type { Middleware } from "../middleware";
import type { LoggerLike } from "./logger";

const noopLogger: LoggerLike = {
  info() {},
  error() {},
};

const consoleLogger: LoggerLike = {
  info(message, meta) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ level: "info", message, ...meta }));
  },
  error(message, meta) {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ level: "error", message, ...meta }));
  },
};

/** 错误处理中间件配置选项 */
export interface ErrorHandlerOptions {
  /** 自定义日志实现 */
  logger?: LoggerLike;
  /** 是否静默 */
  silent?: boolean;
  /** 生产环境返回的固定错误消息，默认 "服务器内部错误" */
  fallbackMessage?: string;
}

/**
 * 全局错误处理中间件：捕获未处理异常，返回统一错误格式。
 * VentoStackError 返回结构化响应（包含 errorCode 和 message）。
 * 其他错误返回 500，且不暴露内部错误细节。
 * @param options - 配置选项
 * @returns Middleware 实例
 */
export function errorHandler(options?: ErrorHandlerOptions): Middleware {
  const logger = options?.silent
    ? noopLogger
    : (options?.logger ?? consoleLogger);
  const fallbackMessage = options?.fallbackMessage ?? "服务器内部错误";

  return async (ctx: Context, next) => {
    try {
      return await next();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      if (error instanceof VentoStackError) {
        logger.error("handled error", {
          method: ctx.method,
          path: ctx.path,
          errorCode: error.errorCode,
          message: error.message,
        });
        const body: Record<string, unknown> = { error: error.errorCode, message: error.message };
        if (error instanceof ValidationError && error.details) {
          body.details = error.details;
        }
        return ctx.json(body, error.code);
      }

      const stack = error instanceof Error ? error.stack : undefined;
      logger.error("unhandled error", {
        method: ctx.method,
        path: ctx.path,
        error: message,
        ...(stack ? { stack } : {}),
      });

      return ctx.json({ error: "INTERNAL_ERROR", message: fallbackMessage }, 500);
    }
  };
}

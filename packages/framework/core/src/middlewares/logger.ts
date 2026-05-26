// @ventostack/core - 内置请求日志中间件

import type { Context } from "../context";
import type { Middleware } from "../middleware";

/** 日志接口 */
export interface LoggerLike {
  /**
   * 输出 info 级别日志
   * @param message - 日志消息
   * @param meta - 附加元数据
   */
  info(message: string, meta?: Record<string, unknown>): void;
  /**
   * 输出 error 级别日志
   * @param message - 日志消息
   * @param meta - 附加元数据
   */
  error(message: string, meta?: Record<string, unknown>): void;
}

const noopLogger: LoggerLike = {
  info() {},
  error() {},
};

const consoleLogger: LoggerLike = {
  info(message, meta) {
    console.log(JSON.stringify({ level: "info", message, ...meta }));
  },
  error(message, meta) {
    console.error(JSON.stringify({ level: "error", message, ...meta }));
  },
};

/** 请求日志中间件配置选项 */
export interface RequestLoggerOptions {
  /** 自定义日志实现 */
  logger?: LoggerLike;
  /** 是否静默（不输出日志） */
  silent?: boolean;
}

/**
 * 请求日志中间件：记录请求方法、路径、状态码、耗时。
 * 默认输出结构化 JSON 到 console，可通过 options.logger 替换。
 * @param options - 配置选项
 * @returns Middleware 实例
 */
export function requestLogger(options?: RequestLoggerOptions): Middleware {
  const logger = options?.silent
    ? noopLogger
    : (options?.logger ?? consoleLogger);

  return async (ctx: Context, next) => {
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

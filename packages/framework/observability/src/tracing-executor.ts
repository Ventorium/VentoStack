/**
 * @ventostack/observability — SQL Executor Tracing Wrapper
 *
 * 包装 SqlExecutor，为每次数据库查询创建子 Span，
 * 记录 SQL 语句、参数数量、返回行数和耗时。
 */

import type { Tracer, SpanContext } from "./tracing";

export type SqlExecutor = (text: string, params?: unknown[]) => Promise<unknown[]>;

export interface ExecutorTracingOptions {
  /** 获取当前请求的 SpanContext，通常从 AsyncLocalStorage 读取 */
  getSpanContext: () => SpanContext | undefined;
}

/**
 * 包装 SqlExecutor，添加追踪能力
 * @param executor - 原始 SQL 执行器
 * @param tracer - 追踪器实例
 * @param options - 配置，必须提供 getSpanContext 回调
 * @returns 包装后的 SQL 执行器
 */
export function wrapExecutorWithTracing(
  executor: SqlExecutor,
  tracer: Tracer,
  options: ExecutorTracingOptions,
): SqlExecutor {
  return async (text: string, params?: unknown[]): Promise<unknown[]> => {
    const parentContext = options.getSpanContext();
    if (!parentContext) {
      return executor(text, params);
    }

    const span = tracer.startSpan("sql.query", parentContext);
    span.setAttribute("db.system", "postgresql");
    span.setAttribute("db.statement", text);
    if (params && params.length > 0) {
      span.setAttribute("db.params_count", params.length);
    }

    try {
      const rows = await executor(text, params);
      span.setAttribute("db.result_rows", Array.isArray(rows) ? rows.length : 0);
      span.end();
      return rows;
    } catch (err) {
      span.setStatus("error");
      if (err instanceof Error) {
        span.setAttribute("db.error", err.message);
      }
      span.end();
      throw err;
    }
  };
}

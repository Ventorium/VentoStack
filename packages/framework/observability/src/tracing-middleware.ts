/**
 * @ventostack/observability — Request Tracing Middleware
 *
 * 为每个 HTTP 请求创建追踪 Span，支持 W3C TraceContext 传播。
 * 从请求头提取父 SpanContext（如有），创建子 Span 并注入响应头。
 */

import type { Context } from "@ventostack/core";
import type { Middleware } from "@ventostack/core";
import type { Tracer, SpanContext } from "./tracing";
import { createW3CTraceContextPropagator } from "./trace-context";
import type { TraceContextPropagator } from "./trace-context";

export interface TracingMiddlewareOptions {
  /** 自定义传播器，默认使用 W3C TraceContext */
  propagator?: TraceContextPropagator;
  /**
   * AsyncLocalStorage 实例，用于在整个请求生命周期内传播 SpanContext。
   * 设置后，中间件会在 traceStore.run(spanContext, ...) 内执行 next()，
   * 使下游所有异步调用（包括 executor wrapper）可通过 getStore() 获取当前 SpanContext。
   */
  traceStore?: AsyncLocalStorage<SpanContext>;
}

/**
 * 创建请求追踪中间件
 * @param tracer - 追踪器实例
 * @param options - 可选配置
 * @returns Middleware 实例
 */
export function createTracingMiddleware(
  tracer: Tracer,
  options?: TracingMiddlewareOptions,
): Middleware {
  const propagator = options?.propagator ?? createW3CTraceContextPropagator();

  return async (ctx: Context, next) => {
    // 1. 从请求头提取父 SpanContext
    const parentContext: SpanContext | null = propagator.extract(ctx.headers);

    // 2. 创建 Span
    const spanName = `${ctx.method} ${ctx.path}`;
    const span = tracer.startSpan(spanName, parentContext ?? undefined);

    // 3. 存入 ctx.state
    const spanCtx = span.context();
    ctx.state.traceId = spanCtx.traceId;
    ctx.state.span = span;

    // 4. 设置请求属性
    span.setAttribute("http.method", ctx.method);
    span.setAttribute("http.url", ctx.url);
    span.setAttribute("http.path", ctx.path);

    // 5. 在 AsyncLocalStorage 上下文中执行下游中间件
    const run = <T>(fn: () => Promise<T>): Promise<T> => {
      return options?.traceStore
        ? options.traceStore.run(spanCtx, fn)
        : fn();
    };

    try {
      const response = await run(next);

      // 6. 设置响应属性
      span.setAttribute("http.status_code", response.status);

      if (response.status >= 500) {
        span.setStatus("error");
      }

      // 7. 注入 trace context 到响应头
      const newHeaders = new Headers(response.headers);
      propagator.inject(spanCtx, newHeaders);

      span.end();

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    } catch (err) {
      span.setStatus("error");
      span.setAttribute("error", true);
      if (err instanceof Error) {
        span.addEvent("exception", {
          "exception.type": err.name,
          "exception.message": err.message,
        });
      }

      span.end();

      throw err;
    }
  };
}

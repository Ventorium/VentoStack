/**
 * @ventostack/observability — ContextState 追踪类型增强
 *
 * 通过 TypeScript 模块增强为 @ventostack/core 的 ContextState
 * 添加 traceId 和 span 字段，使下游 handler 可类型安全地访问追踪上下文
 */

import type { SpanHandle } from "./tracing";

declare module "@ventostack/core" {
  interface ContextState {
    /** 当前请求的 trace ID */
    traceId?: string;
    /** 当前请求的活跃 Span 句柄 */
    span?: SpanHandle;
  }
}

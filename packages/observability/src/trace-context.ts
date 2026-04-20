// @aeron/observability - W3C TraceContext 传播

import type { SpanContext } from "./tracing";

/**
 * W3C Trace Context traceparent 格式:
 * 00-{traceId}-{parentId}-{flags}
 */
const TRACEPARENT_REGEX = /^00-([a-f0-9]{32})-([a-f0-9]{16})-([a-f0-9]{2})$/;

export interface TraceContextPropagator {
  /** 从 headers 提取 trace context */
  extract(headers: Headers): SpanContext | null;
  /** 注入 trace context 到 headers */
  inject(context: SpanContext, headers: Headers): void;
}

/**
 * W3C TraceContext 传播器
 * https://www.w3.org/TR/trace-context/
 */
export function createW3CTraceContextPropagator(): TraceContextPropagator {
  return {
    extract(headers) {
      const traceparent = headers.get("traceparent");
      if (!traceparent) return null;

      const match = TRACEPARENT_REGEX.exec(traceparent);
      if (!match) return null;

      const traceId = match[1]!;
      const spanId = match[2]!;

      // 验证不全是0
      if (traceId === "00000000000000000000000000000000") return null;
      if (spanId === "0000000000000000") return null;

      return { traceId, spanId };
    },

    inject(context, headers) {
      const flags = "01"; // sampled
      const traceparent = `00-${context.traceId}-${context.spanId}-${flags}`;
      headers.set("traceparent", traceparent);

      // tracestate 可以传播自定义数据
      const existingState = headers.get("tracestate");
      if (!existingState) {
        headers.set("tracestate", `aeron=${context.spanId}`);
      }
    },
  };
}

/**
 * B3 传播器 (Zipkin)
 */
export function createB3Propagator(): TraceContextPropagator {
  return {
    extract(headers) {
      // B3 single header format: {traceId}-{spanId}-{sampling}-{parentSpanId}
      const b3 = headers.get("b3");
      if (b3) {
        const parts = b3.split("-");
        if (parts.length >= 2) {
          return { traceId: parts[0]!, spanId: parts[1]! };
        }
      }

      // B3 multi-header format
      const traceId = headers.get("x-b3-traceid");
      const spanId = headers.get("x-b3-spanid");
      if (traceId && spanId) {
        return { traceId, spanId };
      }

      return null;
    },

    inject(context, headers) {
      headers.set("x-b3-traceid", context.traceId);
      headers.set("x-b3-spanid", context.spanId);
      headers.set("x-b3-sampled", "1");
    },
  };
}

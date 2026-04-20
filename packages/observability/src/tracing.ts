// @aeron/observability — Request Tracing

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: "ok" | "error";
  attributes: Record<string, unknown>;
  events: Array<{ name: string; timestamp: number; attributes?: Record<string, unknown> }>;
}

export interface SpanContext {
  traceId: string;
  spanId: string;
}

export interface SpanHandle {
  context(): SpanContext;
  setAttribute(key: string, value: unknown): void;
  addEvent(name: string, attributes?: Record<string, unknown>): void;
  setStatus(status: "ok" | "error"): void;
  end(): void;
}

export interface Tracer {
  startSpan(name: string, parentContext?: SpanContext): SpanHandle;
  getActiveSpan(): SpanHandle | null;
  flush(): Span[];
}

function generateTraceId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

function generateSpanId(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 16);
}

export function createTracer(): Tracer {
  const activeSpans: Array<{ span: Span; handle: SpanHandle }> = [];
  const completed: Span[] = [];

  function startSpan(name: string, parentContext?: SpanContext): SpanHandle {
    const traceId = parentContext?.traceId ?? generateTraceId();
    const spanId = generateSpanId();

    const span: Span = {
      traceId,
      spanId,
      parentSpanId: parentContext?.spanId,
      name,
      startTime: performance.now(),
      status: "ok",
      attributes: {},
      events: [],
    };

    const handle: SpanHandle = {
      context(): SpanContext {
        return { traceId: span.traceId, spanId: span.spanId };
      },
      setAttribute(key: string, value: unknown): void {
        span.attributes[key] = value;
      },
      addEvent(eventName: string, attributes?: Record<string, unknown>): void {
        span.events.push({
          name: eventName,
          timestamp: performance.now(),
          attributes,
        });
      },
      setStatus(status: "ok" | "error"): void {
        span.status = status;
      },
      end(): void {
        span.endTime = performance.now();
        span.duration = span.endTime - span.startTime;
        const idx = activeSpans.findIndex((entry) => entry.span === span);
        if (idx !== -1) {
          activeSpans.splice(idx, 1);
        }
        completed.push(span);
      },
    };

    activeSpans.push({ span, handle });
    return handle;
  }

  function getActiveSpan(): SpanHandle | null {
    if (activeSpans.length === 0) return null;
    return activeSpans[activeSpans.length - 1]!.handle;
  }

  function flush(): Span[] {
    const result = [...completed];
    completed.length = 0;
    return result;
  }

  return { startSpan, getActiveSpan, flush };
}

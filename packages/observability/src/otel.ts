// @aeron/observability - OpenTelemetry 集成

export interface OTelSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: "internal" | "server" | "client" | "producer" | "consumer";
  startTime: number;
  endTime?: number;
  status: "ok" | "error" | "unset";
  attributes: Record<string, string | number | boolean>;
  events: Array<{ name: string; timestamp: number; attributes?: Record<string, unknown> }>;
}

export interface OTelConfig {
  serviceName: string;
  serviceVersion?: string;
  /** 采样率 0-1 */
  sampleRate?: number;
  /** 导出器 */
  exporter?: SpanExporter;
}

export interface SpanExporter {
  export(spans: OTelSpan[]): Promise<void>;
}

export interface Tracer {
  startSpan(name: string, options?: { kind?: OTelSpan["kind"]; parent?: OTelSpan; attributes?: Record<string, string | number | boolean> }): OTelSpan;
  endSpan(span: OTelSpan, status?: OTelSpan["status"]): void;
  addEvent(span: OTelSpan, name: string, attributes?: Record<string, unknown>): void;
  flush(): Promise<void>;
  getActiveSpans(): OTelSpan[];
}

function generateId(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 创建 OpenTelemetry 兼容 Tracer
 */
export function createTracer(config: OTelConfig): Tracer {
  const sampleRate = config.sampleRate ?? 1.0;
  const pendingSpans: OTelSpan[] = [];
  const activeSpans = new Set<OTelSpan>();

  function shouldSample(): boolean {
    return Math.random() < sampleRate;
  }

  return {
    startSpan(name, options) {
      if (!shouldSample()) {
        // 返回 noop span
        return {
          traceId: "0".repeat(32),
          spanId: "0".repeat(16),
          name,
          kind: options?.kind ?? "internal",
          startTime: Date.now(),
          status: "unset",
          attributes: {},
          events: [],
        };
      }

      const span: OTelSpan = {
        traceId: options?.parent?.traceId ?? generateId(16),
        spanId: generateId(8),
        parentSpanId: options?.parent?.spanId,
        name,
        kind: options?.kind ?? "internal",
        startTime: Date.now(),
        status: "unset",
        attributes: {
          "service.name": config.serviceName,
          ...(config.serviceVersion ? { "service.version": config.serviceVersion } : {}),
          ...(options?.attributes ?? {}),
        },
        events: [],
      };

      activeSpans.add(span);
      return span;
    },

    endSpan(span, status) {
      span.endTime = Date.now();
      span.status = status ?? "ok";
      activeSpans.delete(span);
      pendingSpans.push(span);
    },

    addEvent(span, name, attributes) {
      span.events.push({ name, timestamp: Date.now(), attributes });
    },

    async flush(): Promise<void> {
      if (!config.exporter || pendingSpans.length === 0) return;
      const batch = pendingSpans.splice(0, pendingSpans.length);
      await config.exporter.export(batch);
    },

    getActiveSpans(): OTelSpan[] {
      return Array.from(activeSpans);
    },
  };
}

/**
 * 创建控制台 Span 导出器（开发用）
 */
export function createConsoleExporter(): SpanExporter {
  return {
    async export(spans) {
      for (const span of spans) {
        console.log(
          `[TRACE] ${span.name} traceId=${span.traceId} spanId=${span.spanId} duration=${(span.endTime ?? Date.now()) - span.startTime}ms status=${span.status}`,
        );
      }
    },
  };
}

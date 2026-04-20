// @aeron/observability - Trace 导出（Jaeger / Zipkin / Tempo）

import type { OTelSpan, SpanExporter } from "./otel.js";

export interface TraceExporterConfig {
  /** 后端类型 */
  type: "jaeger" | "zipkin" | "tempo" | "otlp";
  /** 上报端点 */
  endpoint: string;
  /** 自定义 headers */
  headers?: Record<string, string>;
  /** 批量大小 */
  batchSize?: number;
  /** 发送间隔（ms） */
  flushInterval?: number;
}

/**
 * 转换为 Zipkin 格式
 */
function toZipkinSpan(span: OTelSpan) {
  return {
    traceId: span.traceId,
    id: span.spanId,
    parentId: span.parentSpanId,
    name: span.name,
    timestamp: span.startTime * 1000, // Zipkin 用微秒
    duration: ((span.endTime ?? Date.now()) - span.startTime) * 1000,
    kind: span.kind === "server" ? "SERVER" : span.kind === "client" ? "CLIENT" : undefined,
    tags: Object.fromEntries(
      Object.entries(span.attributes).map(([k, v]) => [k, String(v)]),
    ),
    annotations: span.events.map((e) => ({
      timestamp: e.timestamp * 1000,
      value: e.name,
    })),
  };
}

/**
 * 转换为 OTLP JSON 格式
 */
function toOTLPSpan(span: OTelSpan) {
  const kindMap: Record<string, number> = {
    internal: 1,
    server: 2,
    client: 3,
    producer: 4,
    consumer: 5,
  };
  const statusMap: Record<string, number> = {
    unset: 0,
    ok: 1,
    error: 2,
  };

  return {
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId ?? "",
    name: span.name,
    kind: kindMap[span.kind] ?? 1,
    startTimeUnixNano: String(span.startTime * 1_000_000),
    endTimeUnixNano: String((span.endTime ?? Date.now()) * 1_000_000),
    status: { code: statusMap[span.status] ?? 0 },
    attributes: Object.entries(span.attributes).map(([key, value]) => ({
      key,
      value: typeof value === "string"
        ? { stringValue: value }
        : typeof value === "number"
          ? { intValue: String(value) }
          : { boolValue: value },
    })),
    events: span.events.map((e) => ({
      timeUnixNano: String(e.timestamp * 1_000_000),
      name: e.name,
    })),
  };
}

/**
 * 创建 Trace 导出器
 */
export function createTraceExporter(config: TraceExporterConfig): SpanExporter & { start(): void; stop(): Promise<void> } {
  const batchSize = config.batchSize ?? 100;
  const flushInterval = config.flushInterval ?? 5000;
  let buffer: OTelSpan[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;

  async function doExport(spans: OTelSpan[]): Promise<void> {
    if (spans.length === 0) return;

    let body: string;
    let contentType = "application/json";

    switch (config.type) {
      case "zipkin":
        body = JSON.stringify(spans.map(toZipkinSpan));
        break;
      case "jaeger":
      case "tempo":
      case "otlp":
        body = JSON.stringify({
          resourceSpans: [{
            resource: {
              attributes: [],
            },
            scopeSpans: [{
              scope: { name: "aeron" },
              spans: spans.map(toOTLPSpan),
            }],
          }],
        });
        break;
      default:
        throw new Error(`Unknown trace exporter type: ${config.type}`);
    }

    await fetch(config.endpoint, {
      method: "POST",
      headers: { "Content-Type": contentType, ...config.headers },
      body,
    });
  }

  return {
    async export(spans: OTelSpan[]): Promise<void> {
      buffer.push(...spans);
      if (buffer.length >= batchSize) {
        const batch = buffer.splice(0, buffer.length);
        await doExport(batch);
      }
    },

    start(): void {
      if (timer) return;
      timer = setInterval(async () => {
        const batch = buffer.splice(0, buffer.length);
        await doExport(batch);
      }, flushInterval);
    },

    async stop(): Promise<void> {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      const batch = buffer.splice(0, buffer.length);
      await doExport(batch);
    },
  };
}

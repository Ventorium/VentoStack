import { describe, test, expect, mock } from "bun:test";
import { createTracer, createConsoleExporter } from "../otel";

describe("createTracer", () => {
  test("startSpan creates span with traceId and spanId", () => {
    const tracer = createTracer({ serviceName: "test-service" });
    const span = tracer.startSpan("test-op");
    expect(span.traceId).toBeDefined();
    expect(span.spanId).toBeDefined();
    expect(span.name).toBe("test-op");
    expect(span.status).toBe("unset");
    expect(span.attributes["service.name"]).toBe("test-service");
  });

  test("startSpan with parent inherits traceId", () => {
    const tracer = createTracer({ serviceName: "test" });
    const parent = tracer.startSpan("parent");
    const child = tracer.startSpan("child", { parent });
    expect(child.traceId).toBe(parent.traceId);
    expect(child.parentSpanId).toBe(parent.spanId);
  });

  test("endSpan sets endTime and status", () => {
    const tracer = createTracer({ serviceName: "test" });
    const span = tracer.startSpan("op");
    expect(tracer.getActiveSpans()).toHaveLength(1);
    tracer.endSpan(span, "ok");
    expect(span.endTime).toBeDefined();
    expect(span.status).toBe("ok");
    expect(tracer.getActiveSpans()).toHaveLength(0);
  });

  test("addEvent adds to span events", () => {
    const tracer = createTracer({ serviceName: "test" });
    const span = tracer.startSpan("op");
    tracer.addEvent(span, "checkpoint", { key: "val" });
    expect(span.events).toHaveLength(1);
    expect(span.events[0].name).toBe("checkpoint");
  });

  test("flush exports pending spans", async () => {
    const exported: unknown[] = [];
    const tracer = createTracer({
      serviceName: "test",
      exporter: { export: async (spans) => { exported.push(...spans); } },
    });
    const span = tracer.startSpan("op");
    tracer.endSpan(span);
    await tracer.flush();
    expect(exported).toHaveLength(1);
  });

  test("flush with no exporter does nothing", async () => {
    const tracer = createTracer({ serviceName: "test" });
    const span = tracer.startSpan("op");
    tracer.endSpan(span);
    await tracer.flush(); // should not throw
  });

  test("sampling rate 0 creates noop spans", () => {
    const tracer = createTracer({ serviceName: "test", sampleRate: 0 });
    const span = tracer.startSpan("op");
    expect(span.traceId).toBe("0".repeat(32));
  });

  test("serviceVersion in attributes", () => {
    const tracer = createTracer({ serviceName: "test", serviceVersion: "1.0.0" });
    const span = tracer.startSpan("op");
    expect(span.attributes["service.version"]).toBe("1.0.0");
  });

  test("custom kind", () => {
    const tracer = createTracer({ serviceName: "test" });
    const span = tracer.startSpan("op", { kind: "server" });
    expect(span.kind).toBe("server");
  });
});

describe("createConsoleExporter", () => {
  test("exports spans to console", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => { logs.push(String(args[0])); };
    try {
      const exporter = createConsoleExporter();
      await exporter.export([{
        traceId: "abc", spanId: "def", name: "test",
        kind: "internal", startTime: 1000, endTime: 1050,
        status: "ok", attributes: {}, events: [],
      }]);
      expect(logs.length).toBe(1);
      expect(logs[0]).toContain("[TRACE]");
    } finally {
      console.log = origLog;
    }
  });
});

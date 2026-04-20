import { describe, test, expect } from "bun:test";
import { createTracer } from "../tracing";

describe("createTracer", () => {
  test("startSpan creates a span with traceId and spanId", () => {
    const tracer = createTracer();
    const span = tracer.startSpan("test-op");
    const ctx = span.context();

    expect(ctx.traceId).toHaveLength(32);
    expect(ctx.spanId).toHaveLength(16);
    expect(ctx.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(ctx.spanId).toMatch(/^[0-9a-f]{16}$/);
  });

  test("end() records endTime and duration", () => {
    const tracer = createTracer();
    const span = tracer.startSpan("test-op");
    span.end();

    const spans = tracer.flush();
    expect(spans).toHaveLength(1);
    expect(spans[0]!.endTime).toBeGreaterThan(0);
    expect(spans[0]!.duration).toBeGreaterThanOrEqual(0);
  });

  test("parentContext inherits traceId and sets parentSpanId", () => {
    const tracer = createTracer();
    const parent = tracer.startSpan("parent");
    const parentCtx = parent.context();
    const child = tracer.startSpan("child", parentCtx);
    const childCtx = child.context();

    expect(childCtx.traceId).toBe(parentCtx.traceId);
    expect(childCtx.spanId).not.toBe(parentCtx.spanId);

    child.end();
    parent.end();

    const spans = tracer.flush();
    const childSpan = spans.find((s) => s.name === "child")!;
    expect(childSpan.parentSpanId).toBe(parentCtx.spanId);
  });

  test("setAttribute stores attributes on span", () => {
    const tracer = createTracer();
    const span = tracer.startSpan("test-op");
    span.setAttribute("http.method", "GET");
    span.setAttribute("http.status", 200);
    span.end();

    const spans = tracer.flush();
    expect(spans[0]!.attributes).toEqual({
      "http.method": "GET",
      "http.status": 200,
    });
  });

  test("addEvent records events with timestamps", () => {
    const tracer = createTracer();
    const span = tracer.startSpan("test-op");
    span.addEvent("cache-miss", { key: "user:1" });
    span.addEvent("db-query");
    span.end();

    const spans = tracer.flush();
    expect(spans[0]!.events).toHaveLength(2);
    expect(spans[0]!.events[0]!.name).toBe("cache-miss");
    expect(spans[0]!.events[0]!.attributes).toEqual({ key: "user:1" });
    expect(spans[0]!.events[0]!.timestamp).toBeGreaterThan(0);
    expect(spans[0]!.events[1]!.name).toBe("db-query");
    expect(spans[0]!.events[1]!.attributes).toBeUndefined();
  });

  test("setStatus changes span status", () => {
    const tracer = createTracer();
    const span = tracer.startSpan("test-op");
    expect(tracer.flush()).toHaveLength(0); // not yet ended

    span.setStatus("error");
    span.end();

    const spans = tracer.flush();
    expect(spans[0]!.status).toBe("error");
  });

  test("flush returns and clears completed spans", () => {
    const tracer = createTracer();
    const s1 = tracer.startSpan("op1");
    const s2 = tracer.startSpan("op2");
    s1.end();
    s2.end();

    const first = tracer.flush();
    expect(first).toHaveLength(2);

    const second = tracer.flush();
    expect(second).toHaveLength(0);
  });

  test("getActiveSpan returns the last unfinished span", () => {
    const tracer = createTracer();
    expect(tracer.getActiveSpan()).toBeNull();

    const s1 = tracer.startSpan("op1");
    expect(tracer.getActiveSpan()).toBe(s1);

    const s2 = tracer.startSpan("op2");
    expect(tracer.getActiveSpan()).toBe(s2);

    s2.end();
    expect(tracer.getActiveSpan()).toBe(s1);

    s1.end();
    expect(tracer.getActiveSpan()).toBeNull();
  });

  test("default status is ok", () => {
    const tracer = createTracer();
    const span = tracer.startSpan("test-op");
    span.end();

    const spans = tracer.flush();
    expect(spans[0]!.status).toBe("ok");
  });

  test("span without parent has no parentSpanId", () => {
    const tracer = createTracer();
    const span = tracer.startSpan("root");
    span.end();

    const spans = tracer.flush();
    expect(spans[0]!.parentSpanId).toBeUndefined();
  });
});

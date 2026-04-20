import { describe, test, expect } from "bun:test";
import { createW3CTraceContextPropagator, createB3Propagator } from "../trace-context";

describe("W3C TraceContext Propagator", () => {
  const propagator = createW3CTraceContextPropagator();

  test("extracts valid traceparent", () => {
    const headers = new Headers();
    headers.set("traceparent", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01");
    const ctx = propagator.extract(headers);
    expect(ctx).not.toBeNull();
    expect(ctx!.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(ctx!.spanId).toBe("00f067aa0ba902b7");
  });

  test("returns null for missing traceparent", () => {
    const headers = new Headers();
    const ctx = propagator.extract(headers);
    expect(ctx).toBeNull();
  });

  test("returns null for invalid format", () => {
    const headers = new Headers();
    headers.set("traceparent", "invalid");
    expect(propagator.extract(headers)).toBeNull();
  });

  test("returns null for all-zero traceId", () => {
    const headers = new Headers();
    headers.set("traceparent", "00-00000000000000000000000000000000-00f067aa0ba902b7-01");
    expect(propagator.extract(headers)).toBeNull();
  });

  test("returns null for all-zero spanId", () => {
    const headers = new Headers();
    headers.set("traceparent", "00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01");
    expect(propagator.extract(headers)).toBeNull();
  });

  test("injects traceparent header", () => {
    const headers = new Headers();
    propagator.inject(
      { traceId: "4bf92f3577b34da6a3ce929d0e0e4736", spanId: "00f067aa0ba902b7" },
      headers,
    );
    const traceparent = headers.get("traceparent");
    expect(traceparent).toBe("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01");
  });

  test("injects tracestate header", () => {
    const headers = new Headers();
    propagator.inject(
      { traceId: "abc", spanId: "def" },
      headers,
    );
    expect(headers.get("tracestate")).toContain("aeron=def");
  });

  test("preserves existing tracestate", () => {
    const headers = new Headers();
    headers.set("tracestate", "vendor=abc");
    propagator.inject({ traceId: "abc", spanId: "def" }, headers);
    // Should not overwrite
    expect(headers.get("tracestate")).toBe("vendor=abc");
  });
});

describe("B3 Propagator", () => {
  const propagator = createB3Propagator();

  test("extracts B3 single header", () => {
    const headers = new Headers();
    headers.set("b3", "abc123-def456-1");
    const ctx = propagator.extract(headers);
    expect(ctx).not.toBeNull();
    expect(ctx!.traceId).toBe("abc123");
    expect(ctx!.spanId).toBe("def456");
  });

  test("extracts B3 multi headers", () => {
    const headers = new Headers();
    headers.set("x-b3-traceid", "trace123");
    headers.set("x-b3-spanid", "span456");
    const ctx = propagator.extract(headers);
    expect(ctx).not.toBeNull();
    expect(ctx!.traceId).toBe("trace123");
    expect(ctx!.spanId).toBe("span456");
  });

  test("returns null when no B3 headers", () => {
    const headers = new Headers();
    expect(propagator.extract(headers)).toBeNull();
  });

  test("injects B3 multi headers", () => {
    const headers = new Headers();
    propagator.inject({ traceId: "abc", spanId: "def" }, headers);
    expect(headers.get("x-b3-traceid")).toBe("abc");
    expect(headers.get("x-b3-spanid")).toBe("def");
    expect(headers.get("x-b3-sampled")).toBe("1");
  });
});

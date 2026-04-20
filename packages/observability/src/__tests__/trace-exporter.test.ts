import { describe, test, expect, mock } from "bun:test";
import { createTraceExporter } from "../trace-exporter";

describe("createTraceExporter", () => {
  const testSpan = {
    traceId: "a".repeat(32),
    spanId: "b".repeat(16),
    name: "test-span",
    kind: "server" as const,
    startTime: 1000,
    endTime: 1050,
    status: "ok" as const,
    attributes: { "service.name": "test" },
    events: [{ name: "event1", timestamp: 1025 }],
  };

  test("export zipkin format", async () => {
    const fetchMock = mock(() => Promise.resolve(new Response("ok")));
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const exporter = createTraceExporter({
        type: "zipkin",
        endpoint: "http://localhost:9411/api/v2/spans",
        batchSize: 1,
      });
      await exporter.export([testSpan]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse((fetchMock.mock.calls[0] as unknown[])[1]?.body as string ?? "[]");
      expect(body[0].traceId).toBe(testSpan.traceId);
      expect(body[0].kind).toBe("SERVER");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("export otlp format", async () => {
    const fetchMock = mock(() => Promise.resolve(new Response("ok")));
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const exporter = createTraceExporter({
        type: "otlp",
        endpoint: "http://localhost:4318/v1/traces",
        batchSize: 1,
      });
      await exporter.export([testSpan]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse((fetchMock.mock.calls[0] as unknown[])[1]?.body as string ?? "{}");
      expect(body.resourceSpans).toBeDefined();
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("start and stop timer", async () => {
    const fetchMock = mock(() => Promise.resolve(new Response("ok")));
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const exporter = createTraceExporter({
        type: "zipkin",
        endpoint: "http://localhost:9411",
        flushInterval: 100000,
      });
      exporter.start();
      await exporter.stop();
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("buffering until batch size", async () => {
    const fetchMock = mock(() => Promise.resolve(new Response("ok")));
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const exporter = createTraceExporter({
        type: "zipkin",
        endpoint: "http://localhost:9411",
        batchSize: 5,
      });
      await exporter.export([testSpan]);
      expect(fetchMock).not.toHaveBeenCalled(); // buffered
      await exporter.stop(); // flush on stop
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

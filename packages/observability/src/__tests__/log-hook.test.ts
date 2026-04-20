import { describe, test, expect, mock } from "bun:test";
import { createLogHook } from "../log-hook";

describe("createLogHook", () => {
  test("send adds entry to buffer", () => {
    const hook = createLogHook({ endpoint: "http://localhost:9428" });
    hook.send({ level: "info", message: "test", timestamp: Date.now() });
    expect(hook.pending()).toBe(1);
  });

  test("flush sends entries via fetch", async () => {
    const fetchMock = mock(() => Promise.resolve(new Response("ok")));
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const hook = createLogHook({ endpoint: "http://localhost:9428" });
      hook.send({ level: "info", message: "test", timestamp: Date.now() });
      await hook.flush();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(hook.pending()).toBe(0);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("custom format function", () => {
    const hook = createLogHook({
      endpoint: "http://localhost:9428",
      format: (entry) => `${entry.level}: ${entry.message}`,
    });
    hook.send({ level: "error", message: "boom", timestamp: Date.now() });
    expect(hook.pending()).toBe(1);
  });

  test("start and stop timer", async () => {
    const hook = createLogHook({ endpoint: "http://localhost:9428", flushInterval: 100000 });
    hook.start();
    hook.start(); // idempotent
    await hook.stop();
  });

  test("flush on empty does nothing", async () => {
    const fetchMock = mock(() => Promise.resolve(new Response("ok")));
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const hook = createLogHook({ endpoint: "http://localhost:9428" });
      await hook.flush();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

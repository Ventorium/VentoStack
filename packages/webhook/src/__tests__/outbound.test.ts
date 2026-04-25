import { describe, expect, test } from "bun:test";
import { createOutboundWebhookManager } from "../outbound";
import type { WebhookEvent } from "../types";

function createMockFetch(responses: Array<{ status: number }>) {
  let callIndex = 0;
  const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];

  const fn = async (url: string, init: RequestInit) => {
    calls.push({
      url,
      headers: init.headers as Record<string, string>,
      body: init.body as string,
    });
    const response = responses[callIndex] ?? { status: 200 };
    callIndex++;
    return { status: response.status } as Response;
  };

  return { fn, calls };
}

describe("createOutboundWebhookManager", () => {
  describe("subscribe / unsubscribe", () => {
    test("subscribe returns id and getSubscription retrieves it", () => {
      const mgr = createOutboundWebhookManager();
      const id = mgr.subscribe({
        url: "https://example.com/hook",
        secret: "secret",
        events: ["order.created"],
        active: true,
      });
      const sub = mgr.getSubscription(id);
      expect(sub).toBeDefined();
      expect(sub!.url).toBe("https://example.com/hook");
      expect(sub!.events).toEqual(["order.created"]);
    });

    test("unsubscribe removes subscription", () => {
      const mgr = createOutboundWebhookManager();
      const id = mgr.subscribe({
        url: "https://example.com/hook",
        secret: "secret",
        events: [],
        active: true,
      });
      expect(mgr.unsubscribe(id)).toBe(true);
      expect(mgr.getSubscription(id)).toBeUndefined();
    });

    test("listSubscriptions filters by event and active", () => {
      const mgr = createOutboundWebhookManager();
      mgr.subscribe({ url: "https://a.com", secret: "s1", events: ["a"], active: true });
      mgr.subscribe({ url: "https://b.com", secret: "s2", events: ["b"], active: false });
      mgr.subscribe({ url: "https://c.com", secret: "s3", events: [], active: true });

      expect(mgr.listSubscriptions({ event: "a" })).toHaveLength(2); // "a" + wildcard
      expect(mgr.listSubscriptions({ active: true })).toHaveLength(2);
    });
  });

  describe("send", () => {
    test("delivers to matching subscriptions", async () => {
      const mock = createMockFetch([{ status: 200 }]);
      const mgr = createOutboundWebhookManager({ fetch: mock.fn });
      mgr.subscribe({
        url: "https://example.com/hook",
        secret: "secret",
        events: ["order.created"],
        active: true,
      });

      const ids = await mgr.send("order.created", { orderId: "123" });
      expect(ids).toHaveLength(1);
      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].url).toBe("https://example.com/hook");
    });

    test("includes signature header", async () => {
      const mock = createMockFetch([{ status: 200 }]);
      const mgr = createOutboundWebhookManager({ fetch: mock.fn });
      mgr.subscribe({
        url: "https://example.com/hook",
        secret: "my-secret",
        events: [],
        active: true,
      });

      await mgr.send("test.event", { data: 1 });
      expect(mock.calls[0].headers["X-Webhook-Signature"]).toMatch(/^sha256=/);
    });

    test("skips inactive subscriptions", async () => {
      const mock = createMockFetch([{ status: 200 }]);
      const mgr = createOutboundWebhookManager({ fetch: mock.fn });
      mgr.subscribe({
        url: "https://example.com/hook",
        secret: "secret",
        events: ["test"],
        active: false,
      });

      const ids = await mgr.send("test", {});
      expect(ids).toHaveLength(0);
      expect(mock.calls).toHaveLength(0);
    });

    test("skips non-matching events", async () => {
      const mock = createMockFetch([{ status: 200 }]);
      const mgr = createOutboundWebhookManager({ fetch: mock.fn });
      mgr.subscribe({
        url: "https://example.com/hook",
        secret: "secret",
        events: ["order.created"],
        active: true,
      });

      const ids = await mgr.send("user.created", {});
      expect(ids).toHaveLength(0);
    });

    test("marks delivery as sent on 2xx", async () => {
      const mock = createMockFetch([{ status: 200 }]);
      const mgr = createOutboundWebhookManager({ fetch: mock.fn });
      mgr.subscribe({ url: "https://a.com", secret: "s1", events: [], active: true });

      const [id] = await mgr.send("test", { data: 1 });
      const delivery = mgr.getDelivery(id);
      expect(delivery!.status).toBe("sent");
      expect(delivery!.statusCode).toBe(200);
    });

    test("marks delivery as failed on server error", async () => {
      const mock = createMockFetch([{ status: 500 }]);
      const mgr = createOutboundWebhookManager({ fetch: mock.fn, maxRetries: 1 });
      mgr.subscribe({ url: "https://a.com", secret: "s1", events: [], active: true });

      const [id] = await mgr.send("test", {});
      expect(mgr.getDelivery(id)!.status).toBe("dead");
    });

    test("marks delivery as failed on network error", async () => {
      const mgr = createOutboundWebhookManager({
        fetch: async () => { throw new Error("network error"); },
        maxRetries: 1,
      });
      mgr.subscribe({ url: "https://a.com", secret: "s1", events: [], active: true });

      const [id] = await mgr.send("test", {});
      expect(mgr.getDelivery(id)!.status).toBe("dead");
      expect(mgr.getDelivery(id)!.error).toBe("network error");
    });
  });

  describe("sendEvent", () => {
    test("sends unified WebhookEvent", async () => {
      const mock = createMockFetch([{ status: 200 }]);
      const mgr = createOutboundWebhookManager({ fetch: mock.fn });
      mgr.subscribe({ url: "https://a.com", secret: "s1", events: ["order.created"], active: true });

      const event: WebhookEvent = {
        id: "evt-1",
        type: "order.created",
        source: "my-app",
        payload: { orderId: "123" },
        timestamp: Date.now(),
      };

      const ids = await mgr.sendEvent(event);
      expect(ids).toHaveLength(1);
      expect(mock.calls).toHaveLength(1);
    });
  });

  describe("retry", () => {
    test("retries failed deliveries", async () => {
      let callCount = 0;
      const mock = createMockFetch([]);
      mock.fn = async (url: string, init: RequestInit) => {
        mock.calls.push({ url, headers: init.headers as Record<string, string>, body: init.body as string });
        callCount++;
        if (callCount === 1) return { status: 500 } as Response;
        return { status: 200 } as Response;
      };

      const mgr = createOutboundWebhookManager({ fetch: mock.fn, maxRetries: 3 });
      mgr.subscribe({ url: "https://a.com", secret: "s1", events: [], active: true });

      const [id] = await mgr.send("test", {});
      expect(mgr.getDelivery(id)!.status).toBe("failed");

      const retried = await mgr.retry();
      expect(retried).toBe(1);
      expect(mgr.getDelivery(id)!.status).toBe("sent");
    });
  });

  describe("sign", () => {
    test("produces deterministic signature", () => {
      const mgr = createOutboundWebhookManager();
      const sig = mgr.sign({ foo: "bar" }, "secret");
      expect(sig).toMatch(/^[0-9a-f]{64}$/);
      expect(mgr.sign({ foo: "bar" }, "secret")).toBe(sig);
    });
  });

  describe("stats", () => {
    test("returns correct counts", async () => {
      const mock = createMockFetch([{ status: 200 }, { status: 500 }]);
      const mgr = createOutboundWebhookManager({ fetch: mock.fn, maxRetries: 1 });
      mgr.subscribe({ url: "https://a.com", secret: "s1", events: [], active: true });
      mgr.subscribe({ url: "https://b.com", secret: "s2", events: ["x"], active: true });

      await mgr.send("test", {});
      const stats = mgr.stats();
      expect(stats.subscriptions).toBe(2);
      expect(stats.sent).toBe(1);
    });

    test("starts at zero", () => {
      const mgr = createOutboundWebhookManager();
      const stats = mgr.stats();
      expect(stats.subscriptions).toBe(0);
      expect(stats.sent).toBe(0);
    });
  });

  describe("listDeliveries", () => {
    test("filters by status", async () => {
      const mock = createMockFetch([{ status: 200 }, { status: 500 }]);
      const mgr = createOutboundWebhookManager({ fetch: mock.fn, maxRetries: 1 });
      mgr.subscribe({ url: "https://a.com", secret: "s1", events: [], active: true });

      await mgr.send("test", {});
      const sent = mgr.listDeliveries({ status: "sent" });
      expect(sent).toHaveLength(1);
    });
  });

  describe("custom options", () => {
    test("uses custom signatureHeader", async () => {
      const mock = createMockFetch([{ status: 200 }]);
      const mgr = createOutboundWebhookManager({
        fetch: mock.fn,
        signatureHeader: "X-Custom-Sig",
      });
      mgr.subscribe({ url: "https://a.com", secret: "s1", events: [], active: true });

      await mgr.send("test", {});
      expect(mock.calls[0].headers["X-Custom-Sig"]).toBeDefined();
    });

    test("passes subscription custom headers", async () => {
      const mock = createMockFetch([{ status: 200 }]);
      const mgr = createOutboundWebhookManager({ fetch: mock.fn });
      mgr.subscribe({
        url: "https://a.com",
        secret: "s1",
        events: [],
        active: true,
        headers: { "Authorization": "Bearer token123" },
      });

      await mgr.send("test", {});
      expect(mock.calls[0].headers["Authorization"]).toBe("Bearer token123");
    });
  });

  describe("sendEvent context", () => {
    test("preserves full WebhookEvent context in delivery", async () => {
      const mock = createMockFetch([{ status: 200 }]);
      const mgr = createOutboundWebhookManager({ fetch: mock.fn });
      mgr.subscribe({ url: "https://a.com", secret: "s1", events: ["order.created"], active: true });

      const event: WebhookEvent = {
        id: "evt-original-123",
        type: "order.created",
        source: "payment-service",
        payload: { orderId: "456" },
        metadata: { region: "cn" },
        timestamp: 1700000000000,
      };

      const [deliveryId] = await mgr.sendEvent(event);
      const delivery = mgr.getDelivery(deliveryId)!;

      expect(delivery.eventId).toBe("evt-original-123");
      expect(delivery.source).toBe("payment-service");
      expect(delivery.eventMetadata).toEqual({ region: "cn" });
      expect(delivery.eventTimestamp).toBe(1700000000000);
    });
  });

  describe("destroy", () => {
    test("clears all state", async () => {
      const mock = createMockFetch([{ status: 200 }]);
      const mgr = createOutboundWebhookManager({ fetch: mock.fn });
      mgr.subscribe({ url: "https://a.com", secret: "s1", events: [], active: true });
      await mgr.send("test", {});

      expect(mgr.stats().subscriptions).toBe(1);
      expect(mgr.stats().sent).toBe(1);

      mgr.destroy();

      expect(mgr.stats().subscriptions).toBe(0);
      expect(mgr.stats().sent).toBe(0);
      expect(mgr.listSubscriptions()).toHaveLength(0);
      expect(mgr.listDeliveries()).toHaveLength(0);
    });
  });
});

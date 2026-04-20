import { describe, test, expect } from "bun:test";
import { createMetrics } from "../metrics";

describe("createMetrics", () => {
  describe("counter", () => {
    test("basic increment", () => {
      const metrics = createMetrics();
      const c = metrics.counter("requests_total", "Total requests");

      c.inc();
      c.inc();

      expect(c.get()).toBe(2);
    });

    test("increment by value", () => {
      const metrics = createMetrics();
      const c = metrics.counter("bytes_total");

      c.inc(undefined, 100);
      c.inc(undefined, 50);

      expect(c.get()).toBe(150);
    });

    test("supports labels", () => {
      const metrics = createMetrics();
      const c = metrics.counter("requests_total");

      c.inc({ method: "GET" });
      c.inc({ method: "GET" });
      c.inc({ method: "POST" });

      expect(c.get({ method: "GET" })).toBe(2);
      expect(c.get({ method: "POST" })).toBe(1);
      expect(c.get({ method: "PUT" })).toBe(0);
    });

    test("get returns 0 for unknown labels", () => {
      const metrics = createMetrics();
      const c = metrics.counter("test");

      expect(c.get()).toBe(0);
      expect(c.get({ foo: "bar" })).toBe(0);
    });

    test("same name returns same counter", () => {
      const metrics = createMetrics();
      const c1 = metrics.counter("test");
      const c2 = metrics.counter("test");

      c1.inc();
      expect(c2.get()).toBe(1);
    });
  });

  describe("histogram", () => {
    test("basic observation", () => {
      const metrics = createMetrics();
      const h = metrics.histogram("duration_seconds", "Request duration");

      h.observe(0.05);
      h.observe(0.15);
      h.observe(0.5);

      const snap = h.get();
      expect(snap.count).toBe(3);
      expect(snap.sum).toBeCloseTo(0.7);
    });

    test("bucket distribution", () => {
      const metrics = createMetrics();
      const h = metrics.histogram("test", undefined, [0.1, 0.5, 1.0]);

      h.observe(0.05); // <= 0.1, 0.5, 1.0
      h.observe(0.3);  // <= 0.5, 1.0
      h.observe(0.8);  // <= 1.0
      h.observe(2.0);  // > all

      const snap = h.get();
      expect(snap.count).toBe(4);
      expect(snap.buckets.get(0.1)).toBe(1);
      expect(snap.buckets.get(0.5)).toBe(2);
      expect(snap.buckets.get(1.0)).toBe(3);
    });

    test("supports labels", () => {
      const metrics = createMetrics();
      const h = metrics.histogram("test", undefined, [1, 5, 10]);

      h.observe(2, { route: "/api" });
      h.observe(3, { route: "/api" });
      h.observe(7, { route: "/home" });

      const apiSnap = h.get({ route: "/api" });
      expect(apiSnap.count).toBe(2);
      expect(apiSnap.sum).toBe(5);

      const homeSnap = h.get({ route: "/home" });
      expect(homeSnap.count).toBe(1);
    });

    test("get returns zeros for unknown labels", () => {
      const metrics = createMetrics();
      const h = metrics.histogram("test", undefined, [1, 5]);

      const snap = h.get({ route: "/unknown" });
      expect(snap.count).toBe(0);
      expect(snap.sum).toBe(0);
      expect(snap.buckets.get(1)).toBe(0);
      expect(snap.buckets.get(5)).toBe(0);
    });

    test("uses default buckets", () => {
      const metrics = createMetrics();
      const h = metrics.histogram("test");

      h.observe(0.001);
      const snap = h.get();
      expect(snap.buckets.size).toBe(11);
      expect(snap.buckets.get(0.005)).toBe(1);
    });

    test("custom default buckets via options", () => {
      const metrics = createMetrics({ defaultBuckets: [1, 2, 3] });
      const h = metrics.histogram("test");

      h.observe(1.5);
      const snap = h.get();
      expect(snap.buckets.size).toBe(3);
      expect(snap.buckets.get(1)).toBe(0);
      expect(snap.buckets.get(2)).toBe(1);
      expect(snap.buckets.get(3)).toBe(1);
    });
  });

  describe("render", () => {
    test("renders counter in Prometheus format", () => {
      const metrics = createMetrics();
      const c = metrics.counter("http_requests_total", "Total HTTP requests");
      c.inc({ method: "GET" }, 5);
      c.inc({ method: "POST" }, 3);

      const output = metrics.render();

      expect(output).toContain("# HELP http_requests_total Total HTTP requests");
      expect(output).toContain("# TYPE http_requests_total counter");
      expect(output).toContain('http_requests_total{method="GET"} 5');
      expect(output).toContain('http_requests_total{method="POST"} 3');
    });

    test("renders histogram in Prometheus format", () => {
      const metrics = createMetrics();
      const h = metrics.histogram("request_duration", "Duration", [0.1, 1, 10]);
      h.observe(0.05);
      h.observe(5);

      const output = metrics.render();

      expect(output).toContain("# HELP request_duration Duration");
      expect(output).toContain("# TYPE request_duration histogram");
      expect(output).toContain('request_duration_bucket{le="0.1"} 1');
      expect(output).toContain('request_duration_bucket{le="1"} 1');
      expect(output).toContain('request_duration_bucket{le="10"} 2');
      expect(output).toContain('request_duration_bucket{le="+Inf"} 2');
      expect(output).toContain("request_duration_sum 5.05");
      expect(output).toContain("request_duration_count 2");
    });

    test("renders counter without help", () => {
      const metrics = createMetrics();
      metrics.counter("simple").inc();

      const output = metrics.render();

      expect(output).not.toContain("# HELP");
      expect(output).toContain("# TYPE simple counter");
      expect(output).toContain("simple 1");
    });

    test("renders counter without labels", () => {
      const metrics = createMetrics();
      const c = metrics.counter("total");
      c.inc();
      c.inc();

      const output = metrics.render();

      expect(output).toContain("total 2");
    });

    test("prefix is applied to metric names", () => {
      const metrics = createMetrics({ prefix: "myapp" });
      metrics.counter("requests").inc();

      const output = metrics.render();

      expect(output).toContain("myapp_requests 1");
    });
  });

  describe("reset", () => {
    test("clears all metrics", () => {
      const metrics = createMetrics();
      metrics.counter("c").inc();
      metrics.histogram("h").observe(1);

      metrics.reset();

      expect(metrics.render()).toBe("");
    });
  });

  describe("disabled metrics", () => {
    test("all operations are no-op when disabled", () => {
      const metrics = createMetrics({ enabled: false });

      const c = metrics.counter("test");
      c.inc();
      expect(c.get()).toBe(0);

      const h = metrics.histogram("test");
      h.observe(1);
      const snap = h.get();
      expect(snap.count).toBe(0);

      expect(metrics.render()).toBe("");
    });

    test("reset does not throw when disabled", () => {
      const metrics = createMetrics({ enabled: false });
      metrics.reset(); // should not throw
    });
  });
});

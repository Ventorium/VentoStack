import { describe, test, expect } from "bun:test";
import { createMetrics } from "../metrics";
import { createGauge } from "../gauge";

describe("Gauge", () => {
  test("set and get value", () => {
    const gauge = createGauge();
    gauge.set(42);
    expect(gauge.get()).toBe(42);
  });

  test("inc increments by 1", () => {
    const gauge = createGauge();
    gauge.inc();
    gauge.inc();
    expect(gauge.get()).toBe(2);
  });

  test("dec decrements by 1", () => {
    const gauge = createGauge();
    gauge.set(5);
    gauge.dec();
    gauge.dec();
    expect(gauge.get()).toBe(3);
  });

  test("get returns 0 for unset gauge", () => {
    const gauge = createGauge();
    expect(gauge.get()).toBe(0);
  });

  test("reset clears all values", () => {
    const gauge = createGauge();
    gauge.set(10);
    gauge.set(20, { env: "prod" });
    gauge.reset();
    expect(gauge.get()).toBe(0);
    expect(gauge.get({ env: "prod" })).toBe(0);
  });

  test("supports labels", () => {
    const gauge = createGauge();
    gauge.set(1, { method: "GET" });
    gauge.set(2, { method: "POST" });

    expect(gauge.get({ method: "GET" })).toBe(1);
    expect(gauge.get({ method: "POST" })).toBe(2);
    expect(gauge.get()).toBe(0); // no label
  });

  test("labels key is order-independent", () => {
    const gauge = createGauge();
    gauge.set(99, { b: "2", a: "1" });
    expect(gauge.get({ a: "1", b: "2" })).toBe(99);
  });

  test("inc and dec with labels", () => {
    const gauge = createGauge();
    gauge.inc({ region: "us" });
    gauge.inc({ region: "us" });
    gauge.dec({ region: "eu" });

    expect(gauge.get({ region: "us" })).toBe(2);
    expect(gauge.get({ region: "eu" })).toBe(-1);
  });
});

describe("Metrics gauge integration", () => {
  test("createMetrics exposes gauge method", () => {
    const metrics = createMetrics();
    const g = metrics.gauge("active_connections");
    g.set(10);
    expect(g.get()).toBe(10);
  });

  test("gauge with prefix", () => {
    const metrics = createMetrics({ prefix: "app" });
    const g = metrics.gauge("active_connections");
    g.set(5);
    expect(g.get()).toBe(5);
  });

  test("reset clears gauges too", () => {
    const metrics = createMetrics();
    const g = metrics.gauge("connections");
    g.set(42);
    metrics.reset();

    // After reset, getting a new gauge with same name starts fresh
    const g2 = metrics.gauge("connections");
    expect(g2.get()).toBe(0);
  });
});

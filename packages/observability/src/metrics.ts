// @aeron/observability — Metrics (Prometheus-compatible)

import { createGauge, labelsToKey, type Gauge } from "./gauge";

export type { Gauge } from "./gauge";

export interface Counter {
  inc(labels?: Record<string, string>, value?: number): void;
  get(labels?: Record<string, string>): number;
}

export interface HistogramSnapshot {
  count: number;
  sum: number;
  buckets: Map<number, number>;
}

export interface Histogram {
  observe(value: number, labels?: Record<string, string>): void;
  get(labels?: Record<string, string>): HistogramSnapshot;
}

export interface Metrics {
  counter(name: string, help?: string): Counter;
  histogram(name: string, help?: string, buckets?: number[]): Histogram;
  gauge(name: string, help?: string): Gauge;
  render(): string;
  reset(): void;
}

export interface MetricsOptions {
  enabled?: boolean;
  prefix?: string;
  defaultBuckets?: number[];
}

const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

function labelsKey(labels?: Record<string, string>): string {
  if (!labels || Object.keys(labels).length === 0) return "";
  const sorted = Object.keys(labels).sort();
  return sorted.map((k) => `${k}="${labels[k]}"`).join(",");
}

function formatLabels(labels?: Record<string, string>): string {
  const key = labelsKey(labels);
  return key ? `{${key}}` : "";
}

function parseLabelsKey(key: string): Record<string, string> | undefined {
  if (!key) return undefined;
  const result: Record<string, string> = {};
  for (const part of key.split(",")) {
    const [k, v] = part.split("=");
    result[k] = v.slice(1, -1); // remove quotes
  }
  return result;
}

const noopCounter: Counter = {
  inc() {},
  get() { return 0; },
};

const noopHistogram: Histogram = {
  observe() {},
  get() { return { count: 0, sum: 0, buckets: new Map() }; },
};

const noopGauge: Gauge = {
  set() {},
  inc() {},
  dec() {},
  get() { return 0; },
  reset() {},
};

const noopMetrics: Metrics = {
  counter() { return noopCounter; },
  histogram() { return noopHistogram; },
  gauge() { return noopGauge; },
  render() { return ""; },
  reset() {},
};

interface CounterState {
  help?: string;
  values: Map<string, number>;
}

interface HistogramState {
  help?: string;
  buckets: number[];
  // per label-key: { count, sum, bucketCounts }
  values: Map<string, { count: number; sum: number; bucketCounts: Map<number, number> }>;
}

export function createMetrics(options?: MetricsOptions): Metrics {
  const enabled = options?.enabled ?? true;
  if (!enabled) return noopMetrics;

  const prefix = options?.prefix ? `${options.prefix}_` : "";
  const defaultBuckets = options?.defaultBuckets ?? DEFAULT_BUCKETS;

  const counters = new Map<string, CounterState>();
  const histograms = new Map<string, HistogramState>();
  const gauges = new Map<string, { help?: string; gauge: Gauge }>();

  function counter(name: string, help?: string): Counter {
    const fullName = `${prefix}${name}`;
    let state = counters.get(fullName);
    if (!state) {
      state = { help, values: new Map() };
      counters.set(fullName, state);
    }
    return {
      inc(labels?, value = 1) {
        const key = labelsKey(labels);
        state!.values.set(key, (state!.values.get(key) ?? 0) + value);
      },
      get(labels?) {
        return state!.values.get(labelsKey(labels)) ?? 0;
      },
    };
  }

  function histogram(name: string, help?: string, buckets?: number[]): Histogram {
    const fullName = `${prefix}${name}`;
    let state = histograms.get(fullName);
    if (!state) {
      const sortedBuckets = [...(buckets ?? defaultBuckets)].sort((a, b) => a - b);
      state = { help, buckets: sortedBuckets, values: new Map() };
      histograms.set(fullName, state);
    }
    return {
      observe(value, labels?) {
        const key = labelsKey(labels);
        let entry = state!.values.get(key);
        if (!entry) {
          entry = {
            count: 0,
            sum: 0,
            bucketCounts: new Map(state!.buckets.map((b) => [b, 0])),
          };
          state!.values.set(key, entry);
        }
        entry.count++;
        entry.sum += value;
        for (const b of state!.buckets) {
          if (value <= b) {
            entry.bucketCounts.set(b, (entry.bucketCounts.get(b) ?? 0) + 1);
          }
        }
      },
      get(labels?) {
        const entry = state!.values.get(labelsKey(labels));
        if (!entry) {
          return { count: 0, sum: 0, buckets: new Map(state!.buckets.map((b) => [b, 0])) };
        }
        return { count: entry.count, sum: entry.sum, buckets: new Map(entry.bucketCounts) };
      },
    };
  }

  function gauge(name: string, help?: string): Gauge {
    const fullName = `${prefix}${name}`;
    let entry = gauges.get(fullName);
    if (!entry) {
      entry = { help, gauge: createGauge() };
      gauges.set(fullName, entry);
    }
    return entry.gauge;
  }

  function render(): string {
    const lines: string[] = [];

    for (const [name, state] of counters) {
      if (state.help) lines.push(`# HELP ${name} ${state.help}`);
      lines.push(`# TYPE ${name} counter`);
      if (state.values.size === 0) {
        lines.push(`${name} 0`);
      } else {
        for (const [key, value] of state.values) {
          const lbls = key ? parseLabelsKey(key) : undefined;
          lines.push(`${name}${formatLabels(lbls)} ${value}`);
        }
      }
    }

    for (const [name, state] of histograms) {
      if (state.help) lines.push(`# HELP ${name} ${state.help}`);
      lines.push(`# TYPE ${name} histogram`);
      for (const [key, entry] of state.values) {
        const lbls = key ? parseLabelsKey(key) : undefined;
        const lblStr = formatLabels(lbls);
        for (const b of state.buckets) {
          const le = b === Infinity ? "+Inf" : String(b);
          const bucketLabels = lbls
            ? `{${labelsKey(lbls)},le="${le}"}`
            : `{le="${le}"}`;
          lines.push(`${name}_bucket${bucketLabels} ${entry.bucketCounts.get(b) ?? 0}`);
        }
        const infLabels = lbls
          ? `{${labelsKey(lbls)},le="+Inf"}`
          : `{le="+Inf"}`;
        lines.push(`${name}_bucket${infLabels} ${entry.count}`);
        lines.push(`${name}_sum${lblStr} ${entry.sum}`);
        lines.push(`${name}_count${lblStr} ${entry.count}`);
      }
    }

    return lines.join("\n");
  }

  function reset(): void {
    counters.clear();
    histograms.clear();
    gauges.clear();
  }

  return { counter, histogram, gauge, render, reset };
}

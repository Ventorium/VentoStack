// @aeron/observability — Gauge Metric Type

export interface Gauge {
  set(value: number, labels?: Record<string, string>): void;
  inc(labels?: Record<string, string>): void;
  dec(labels?: Record<string, string>): void;
  get(labels?: Record<string, string>): number;
  reset(): void;
}

export function labelsToKey(labels?: Record<string, string>): string {
  if (!labels || Object.keys(labels).length === 0) return "";
  const sorted = Object.keys(labels).sort();
  return JSON.stringify(Object.fromEntries(sorted.map((k) => [k, labels[k]])));
}

export function createGauge(): Gauge {
  const values = new Map<string, number>();

  return {
    set(value: number, labels?: Record<string, string>): void {
      values.set(labelsToKey(labels), value);
    },
    inc(labels?: Record<string, string>): void {
      const key = labelsToKey(labels);
      values.set(key, (values.get(key) ?? 0) + 1);
    },
    dec(labels?: Record<string, string>): void {
      const key = labelsToKey(labels);
      values.set(key, (values.get(key) ?? 0) - 1);
    },
    get(labels?: Record<string, string>): number {
      return values.get(labelsToKey(labels)) ?? 0;
    },
    reset(): void {
      values.clear();
    },
  };
}

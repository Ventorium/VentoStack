// @aeron/observability - Grafana Dashboard JSON 模板生成

export interface GrafanaPanelConfig {
  title: string;
  type: "graph" | "stat" | "gauge" | "table" | "timeseries" | "heatmap";
  query: string;
  datasource?: string;
  unit?: string;
  thresholds?: Array<{ value: number; color: string }>;
}

export interface GrafanaDashboardConfig {
  title: string;
  description?: string;
  tags?: string[];
  refresh?: string;
  timeFrom?: string;
  panels: GrafanaPanelConfig[];
}

export interface GrafanaDashboard {
  generate(): Record<string, unknown>;
  toJSON(): string;
}

/**
 * 创建 Grafana Dashboard JSON 模板
 */
export function createGrafanaDashboard(config: GrafanaDashboardConfig): GrafanaDashboard {
  function buildPanel(panel: GrafanaPanelConfig, index: number) {
    return {
      id: index + 1,
      title: panel.title,
      type: panel.type,
      gridPos: {
        x: (index % 2) * 12,
        y: Math.floor(index / 2) * 8,
        w: 12,
        h: 8,
      },
      datasource: panel.datasource ?? "${DS_PROMETHEUS}",
      targets: [
        {
          expr: panel.query,
          refId: "A",
        },
      ],
      fieldConfig: {
        defaults: {
          ...(panel.unit ? { unit: panel.unit } : {}),
          thresholds: panel.thresholds
            ? {
                mode: "absolute",
                steps: [
                  { value: null as unknown, color: "green" },
                  ...panel.thresholds.map((t) => ({ value: t.value, color: t.color })),
                ],
              }
            : undefined,
        },
      },
    };
  }

  return {
    generate() {
      return {
        dashboard: {
          id: null,
          uid: null,
          title: config.title,
          description: config.description ?? "",
          tags: config.tags ?? [],
          timezone: "browser",
          refresh: config.refresh ?? "30s",
          time: {
            from: config.timeFrom ?? "now-1h",
            to: "now",
          },
          panels: config.panels.map(buildPanel),
          schemaVersion: 39,
          version: 0,
        },
        overwrite: true,
      };
    },

    toJSON(): string {
      return JSON.stringify(this.generate(), null, 2);
    },
  };
}

/**
 * 预设 HTTP 服务 Dashboard 模板
 */
export function createHttpDashboard(serviceName: string): GrafanaDashboard {
  return createGrafanaDashboard({
    title: `${serviceName} - HTTP Metrics`,
    tags: ["aeron", "http", serviceName],
    panels: [
      {
        title: "Request Rate",
        type: "timeseries",
        query: `rate(http_requests_total{service="${serviceName}"}[5m])`,
        unit: "reqps",
      },
      {
        title: "Response Time (p99)",
        type: "timeseries",
        query: `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{service="${serviceName}"}[5m]))`,
        unit: "s",
      },
      {
        title: "Error Rate",
        type: "stat",
        query: `rate(http_requests_total{service="${serviceName}",status=~"5.."}[5m]) / rate(http_requests_total{service="${serviceName}"}[5m])`,
        unit: "percentunit",
        thresholds: [
          { value: 0.01, color: "yellow" },
          { value: 0.05, color: "red" },
        ],
      },
      {
        title: "Active Connections",
        type: "gauge",
        query: `http_active_connections{service="${serviceName}"}`,
      },
    ],
  });
}

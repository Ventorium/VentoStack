import { describe, test, expect } from "bun:test";
import { createGrafanaDashboard, createHttpDashboard } from "../grafana";

describe("createGrafanaDashboard", () => {
  test("generate returns valid structure", () => {
    const dashboard = createGrafanaDashboard({
      title: "Test Dashboard",
      panels: [
        { title: "Panel 1", type: "graph", query: "up" },
      ],
    });
    const result = dashboard.generate();
    expect(result.dashboard).toBeDefined();
    const db = result.dashboard as Record<string, unknown>;
    expect(db.title).toBe("Test Dashboard");
    expect((db.panels as unknown[]).length).toBe(1);
    expect(db.schemaVersion).toBe(39);
  });

  test("panels have gridPos", () => {
    const dashboard = createGrafanaDashboard({
      title: "Test",
      panels: [
        { title: "P1", type: "stat", query: "q1" },
        { title: "P2", type: "gauge", query: "q2" },
      ],
    });
    const result = dashboard.generate();
    const panels = (result.dashboard as Record<string, unknown>).panels as Array<Record<string, unknown>>;
    expect(panels[0].gridPos).toBeDefined();
    expect(panels[1].gridPos).toBeDefined();
  });

  test("custom tags and refresh", () => {
    const dashboard = createGrafanaDashboard({
      title: "Test",
      tags: ["aeron", "test"],
      refresh: "10s",
      panels: [],
    });
    const db = dashboard.generate().dashboard as Record<string, unknown>;
    expect(db.tags).toEqual(["aeron", "test"]);
    expect(db.refresh).toBe("10s");
  });

  test("thresholds in panel", () => {
    const dashboard = createGrafanaDashboard({
      title: "Test",
      panels: [
        { title: "P1", type: "stat", query: "q1", thresholds: [{ value: 80, color: "red" }] },
      ],
    });
    const panels = (dashboard.generate().dashboard as Record<string, unknown>).panels as Array<Record<string, unknown>>;
    const fc = panels[0].fieldConfig as Record<string, Record<string, Record<string, unknown>>>;
    expect(fc.defaults.thresholds).toBeDefined();
  });

  test("toJSON returns valid JSON string", () => {
    const dashboard = createGrafanaDashboard({
      title: "Test",
      panels: [],
    });
    const json = dashboard.toJSON();
    expect(JSON.parse(json)).toBeDefined();
  });
});

describe("createHttpDashboard", () => {
  test("creates dashboard with http panels", () => {
    const dashboard = createHttpDashboard("my-service");
    const result = dashboard.generate();
    const db = result.dashboard as Record<string, unknown>;
    expect(db.title).toContain("my-service");
    expect(db.tags).toContain("http");
    const panels = db.panels as unknown[];
    expect(panels.length).toBeGreaterThanOrEqual(3);
  });
});

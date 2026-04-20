import { describe, test, expect } from "bun:test";
import { computeAPIDiff, generateDiffReport } from "../api-diff";

describe("computeAPIDiff", () => {
  test("detects added endpoints", () => {
    const oldSpec = { paths: {} };
    const newSpec = { paths: { "/users": { get: { summary: "List users" } } } };
    const diff = computeAPIDiff(oldSpec, newSpec);
    expect(diff.summary.added).toBe(1);
    expect(diff.entries[0].type).toBe("added");
    expect(diff.entries[0].path).toBe("/users");
    expect(diff.entries[0].method).toBe("GET");
    expect(diff.hasBreaking).toBe(false);
  });

  test("detects removed endpoints (breaking)", () => {
    const oldSpec = { paths: { "/users": { get: { summary: "List" } } } };
    const newSpec = { paths: {} };
    const diff = computeAPIDiff(oldSpec, newSpec);
    expect(diff.summary.removed).toBe(1);
    expect(diff.entries[0].breaking).toBe(true);
    expect(diff.hasBreaking).toBe(true);
  });

  test("detects deprecated endpoints", () => {
    const oldSpec = { paths: { "/users": { get: { summary: "List" } } } };
    const newSpec = { paths: { "/users": { get: { summary: "List", deprecated: true } } } };
    const diff = computeAPIDiff(oldSpec, newSpec);
    expect(diff.summary.deprecated).toBe(1);
  });

  test("detects modified endpoints", () => {
    const oldSpec = { paths: { "/users": { get: { summary: "v1" } } } };
    const newSpec = { paths: { "/users": { get: { summary: "v2" } } } };
    const diff = computeAPIDiff(oldSpec, newSpec);
    expect(diff.summary.modified).toBeGreaterThanOrEqual(1);
  });

  test("breaking: new required parameter", () => {
    const oldSpec = { paths: { "/users": { get: { parameters: [] } } } };
    const newSpec = { paths: { "/users": { get: { parameters: [{ name: "page", required: true }] } } } };
    const diff = computeAPIDiff(oldSpec, newSpec);
    expect(diff.hasBreaking).toBe(true);
  });

  test("no changes returns empty diff", () => {
    const spec = { paths: { "/users": { get: { summary: "List" } } } };
    const diff = computeAPIDiff(spec, spec);
    expect(diff.entries).toHaveLength(0);
    expect(diff.hasBreaking).toBe(false);
  });

  test("empty specs", () => {
    const diff = computeAPIDiff({}, {});
    expect(diff.entries).toHaveLength(0);
  });
});

describe("generateDiffReport", () => {
  test("generates markdown report", () => {
    const diff = computeAPIDiff(
      { paths: {} },
      { paths: { "/users": { get: { summary: "List" } } } },
    );
    const report = generateDiffReport(diff);
    expect(report).toContain("# API Diff Report");
    expect(report).toContain("Added: 1");
    expect(report).toContain("/users");
  });

  test("includes breaking warning", () => {
    const diff = computeAPIDiff(
      { paths: { "/users": { get: {} } } },
      { paths: {} },
    );
    const report = generateDiffReport(diff);
    expect(report).toContain("Breaking changes");
  });

  test("empty diff report", () => {
    const diff = computeAPIDiff({}, {});
    const report = generateDiffReport(diff);
    expect(report).toContain("Added: 0");
  });
});

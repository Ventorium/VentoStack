import { describe, test, expect } from "bun:test";
import { negotiate } from "../content-negotiation";

describe("negotiate", () => {
  test("returns JSON for null accept", () => {
    const result = negotiate(null);
    expect(result.type).toBe("json");
  });

  test("returns JSON for */*", () => {
    const result = negotiate("*/*");
    expect(result.type).toBe("json");
  });

  test("returns JSON for application/json", () => {
    const result = negotiate("application/json");
    expect(result.type).toBe("json");
  });

  test("returns HTML for text/html", () => {
    const result = negotiate("text/html");
    expect(result.type).toBe("html");
  });

  test("returns text for text/plain", () => {
    const result = negotiate("text/plain");
    expect(result.type).toBe("text");
  });

  test("returns XML for application/xml", () => {
    const result = negotiate("application/xml", ["json", "xml"]);
    expect(result.type).toBe("xml");
  });

  test("respects quality factor", () => {
    const result = negotiate("text/html;q=0.9, application/json;q=1.0");
    expect(result.type).toBe("json");
  });

  test("returns highest quality match", () => {
    const result = negotiate("text/plain;q=0.5, text/html;q=0.8, application/json;q=0.3");
    expect(result.type).toBe("html");
  });

  test("wildcard type match", () => {
    const result = negotiate("text/*");
    expect(result.type).toBe("html"); // first text/* match
  });

  test("defaults to JSON for unsupported type", () => {
    const result = negotiate("application/pdf");
    expect(result.type).toBe("json");
  });

  test("respects supported types parameter", () => {
    const result = negotiate("text/html", ["json", "text"]);
    // HTML not in supported list, so no match, defaults to JSON
    expect(result.type).toBe("json");
  });

  test("returns correct content type string", () => {
    const json = negotiate("application/json");
    expect(json.contentType).toBe("application/json");

    const html = negotiate("text/html");
    expect(html.contentType).toBe("text/html; charset=utf-8");
  });
});

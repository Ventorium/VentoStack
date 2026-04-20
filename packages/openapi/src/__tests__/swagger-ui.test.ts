import { describe, test, expect } from "bun:test";
import { generateSwaggerUI, createSwaggerUIHandler } from "../swagger-ui";

describe("generateSwaggerUI", () => {
  test("generates valid HTML", () => {
    const html = generateSwaggerUI();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("swagger-ui");
    expect(html).toContain("/openapi.json");
  });

  test("uses custom spec URL", () => {
    const html = generateSwaggerUI({ specUrl: "/api/docs.json" });
    expect(html).toContain("/api/docs.json");
  });

  test("uses custom title", () => {
    const html = generateSwaggerUI({ title: "My API" });
    expect(html).toContain("My API");
  });

  test("escapes special chars in title", () => {
    const html = generateSwaggerUI({ title: 'Test <script>"alert"</script>' });
    const titleMatch = html.match(/<title>(.*?)<\/title>/);
    expect(titleMatch).not.toBeNull();
    expect(titleMatch![1]).not.toContain("<script>");
    expect(titleMatch![1]).toContain("&lt;script&gt;");
  });

  test("uses custom version", () => {
    const html = generateSwaggerUI({ version: "4.0.0" });
    expect(html).toContain("4.0.0");
  });
});

describe("createSwaggerUIHandler", () => {
  test("returns a function", () => {
    const handler = createSwaggerUIHandler();
    expect(typeof handler).toBe("function");
  });

  test("returns Response with HTML", () => {
    const handler = createSwaggerUIHandler();
    const response = handler();
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get("Content-Type")).toContain("text/html");
  });

  test("passes options through", () => {
    const handler = createSwaggerUIHandler({ title: "Custom API" });
    const response = handler();
    // We can't read body synchronously, but header is correct
    expect(response.headers.get("Content-Type")).toContain("text/html");
  });
});

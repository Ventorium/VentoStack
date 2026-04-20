import { describe, test, expect } from "bun:test";
import { xssProtection, escapeHTML, detectXSS } from "../../middlewares/xss";
import { createContext } from "../../context";

describe("escapeHTML", () => {
  test("escapes < and >", () => {
    expect(escapeHTML("<script>")).toBe("&lt;script&gt;");
  });

  test("escapes &", () => {
    expect(escapeHTML("a & b")).toContain("&amp;");
  });

  test("escapes quotes", () => {
    const result = escapeHTML('"hello"');
    expect(result).toContain("&quot;");
  });

  test("returns same for safe string", () => {
    expect(escapeHTML("hello world")).toBe("hello world");
  });
});

describe("detectXSS", () => {
  test("detects script tag", () => {
    expect(detectXSS("<script>alert(1)</script>")).toBe(true);
  });

  test("detects javascript: protocol", () => {
    expect(detectXSS("javascript:alert(1)")).toBe(true);
  });

  test("detects event handler", () => {
    expect(detectXSS('onerror=alert(1)')).toBe(true);
  });

  test("detects iframe", () => {
    expect(detectXSS("<iframe src='evil'></iframe>")).toBe(true);
  });

  test("returns false for safe input", () => {
    expect(detectXSS("Hello, World!")).toBe(false);
  });

  test("returns false for regular HTML", () => {
    expect(detectXSS("<p>Hello</p>")).toBe(false);
  });
});

describe("xssProtection middleware", () => {
  test("adds security headers", async () => {
    const middleware = xssProtection();
    const ctx = createContext(new Request("http://localhost/test"));
    const response = await middleware(ctx, async () => new Response("ok"));
    expect(response.headers.get("X-XSS-Protection")).toBe("1; mode=block");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });

  test("custom CSP header", async () => {
    const middleware = xssProtection({
      contentSecurityPolicy: "default-src 'self'",
    });
    const ctx = createContext(new Request("http://localhost/test"));
    const response = await middleware(ctx, async () => new Response("ok"));
    expect(response.headers.get("Content-Security-Policy")).toBe("default-src 'self'");
  });

  test("disable XSS protection header", async () => {
    const middleware = xssProtection({ xssProtection: false });
    const ctx = createContext(new Request("http://localhost/test"));
    const response = await middleware(ctx, async () => new Response("ok"));
    expect(response.headers.get("X-XSS-Protection")).toBeNull();
  });

  test("SAMEORIGIN frame option", async () => {
    const middleware = xssProtection({ frameOptions: "SAMEORIGIN" });
    const ctx = createContext(new Request("http://localhost/test"));
    const response = await middleware(ctx, async () => new Response("ok"));
    expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
  });
});

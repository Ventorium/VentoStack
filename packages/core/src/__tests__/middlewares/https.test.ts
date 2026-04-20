import { describe, test, expect } from "bun:test";
import { httpsEnforce } from "../../middlewares/https";
import { createContext } from "../../context";

describe("httpsEnforce", () => {
  test("redirects HTTP to HTTPS", async () => {
    const middleware = httpsEnforce();
    const ctx = createContext(
      new Request("http://localhost/test", { headers: { "x-forwarded-proto": "http" } }),
    );
    const response = await middleware(ctx, async () => new Response("ok"));
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toContain("https://");
  });

  test("allows HTTPS requests", async () => {
    const middleware = httpsEnforce();
    const ctx = createContext(
      new Request("http://localhost/test", { headers: { "x-forwarded-proto": "https" } }),
    );
    const response = await middleware(ctx, async () => new Response("ok"));
    expect(response.status).toBe(200);
  });

  test("sets HSTS header on HTTPS", async () => {
    const middleware = httpsEnforce({ hsts: true });
    const ctx = createContext(
      new Request("http://localhost/test", { headers: { "x-forwarded-proto": "https" } }),
    );
    const response = await middleware(ctx, async () => new Response("ok"));
    expect(response.headers.get("Strict-Transport-Security")).toContain("max-age=");
  });

  test("HSTS includes subdomains by default", async () => {
    const middleware = httpsEnforce();
    const ctx = createContext(
      new Request("http://localhost/test", { headers: { "x-forwarded-proto": "https" } }),
    );
    const response = await middleware(ctx, async () => new Response("ok"));
    expect(response.headers.get("Strict-Transport-Security")).toContain("includeSubDomains");
  });

  test("HSTS preload flag", async () => {
    const middleware = httpsEnforce({ preload: true });
    const ctx = createContext(
      new Request("http://localhost/test", { headers: { "x-forwarded-proto": "https" } }),
    );
    const response = await middleware(ctx, async () => new Response("ok"));
    expect(response.headers.get("Strict-Transport-Security")).toContain("preload");
  });

  test("excludes paths", async () => {
    const middleware = httpsEnforce({ excludePaths: ["/health"] });
    const ctx = createContext(
      new Request("http://localhost/health", { headers: { "x-forwarded-proto": "http" } }),
    );
    const response = await middleware(ctx, async () => new Response("ok"));
    expect(response.status).toBe(200);
  });

  test("no HSTS when disabled", async () => {
    const middleware = httpsEnforce({ hsts: false });
    const ctx = createContext(
      new Request("http://localhost/test", { headers: { "x-forwarded-proto": "https" } }),
    );
    const response = await middleware(ctx, async () => new Response("ok"));
    expect(response.headers.get("Strict-Transport-Security")).toBeNull();
  });

  test("custom proxy header", async () => {
    const middleware = httpsEnforce({ proxyHeader: "x-scheme" });
    const ctx = createContext(
      new Request("http://localhost/test", { headers: { "x-scheme": "https" } }),
    );
    const response = await middleware(ctx, async () => new Response("ok"));
    expect(response.status).toBe(200);
  });
});

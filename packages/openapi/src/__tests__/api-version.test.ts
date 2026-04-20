import { describe, test, expect } from "bun:test";
import { apiVersion, parseVersionFromAccept } from "../api-version";
import { createContext } from "../../../core/src/context";

describe("parseVersionFromAccept", () => {
  test("parses version from Accept header", () => {
    expect(parseVersionFromAccept("application/vnd.api+json;version=2")).toBe("2");
  });

  test("parses with custom prefix", () => {
    expect(parseVersionFromAccept("application/vnd.myapp+json;version=3", "myapp")).toBe("3");
  });

  test("returns null for invalid format", () => {
    expect(parseVersionFromAccept("application/json")).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(parseVersionFromAccept("")).toBeNull();
  });

  test("handles spaces", () => {
    expect(parseVersionFromAccept("application/vnd.api+json; version=1")).toBe("1");
  });
});

describe("apiVersion middleware", () => {
  const middleware = apiVersion({
    defaultVersion: "1",
    supportedVersions: ["1", "2"],
    deprecatedVersions: ["1"],
  });

  test("uses default version when no header", async () => {
    const ctx = createContext(new Request("http://localhost/test"));
    const response = await middleware(ctx, async () => new Response("ok"));
    expect(ctx.state.get("apiVersion")).toBe("1");
  });

  test("extracts version from Accept header", async () => {
    const ctx = createContext(
      new Request("http://localhost/test", {
        headers: { accept: "application/vnd.api+json;version=2" },
      }),
    );
    await middleware(ctx, async () => new Response("ok"));
    expect(ctx.state.get("apiVersion")).toBe("2");
  });

  test("extracts version from X-API-Version header", async () => {
    const ctx = createContext(
      new Request("http://localhost/test", {
        headers: { "x-api-version": "2" },
      }),
    );
    await middleware(ctx, async () => new Response("ok"));
    expect(ctx.state.get("apiVersion")).toBe("2");
  });

  test("rejects unsupported version", async () => {
    const ctx = createContext(
      new Request("http://localhost/test", {
        headers: { "x-api-version": "99" },
      }),
    );
    const response = await middleware(ctx, async () => new Response("ok"));
    expect(response.status).toBe(400);
    const body = await response.json() as { error: string };
    expect(body.error).toBe("UNSUPPORTED_VERSION");
  });

  test("adds Deprecation header for deprecated version", async () => {
    const ctx = createContext(
      new Request("http://localhost/test", {
        headers: { "x-api-version": "1" },
      }),
    );
    const response = await middleware(ctx, async () => new Response("ok"));
    expect(response.headers.get("Deprecation")).toBe("true");
  });

  test("no Deprecation header for current version", async () => {
    const ctx = createContext(
      new Request("http://localhost/test", {
        headers: { "x-api-version": "2" },
      }),
    );
    const response = await middleware(ctx, async () => new Response("ok"));
    expect(response.headers.get("Deprecation")).toBeNull();
  });
});

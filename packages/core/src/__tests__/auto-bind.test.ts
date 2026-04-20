import { describe, test, expect } from "bun:test";
import { bindJSON, bindForm, bindQuery } from "../auto-bind";
import { createContext } from "../context";
import type { Schema } from "../validator";

function makeJSONCtx(body: unknown, contentType = "application/json"): ReturnType<typeof createContext> {
  const json = JSON.stringify(body);
  const req = new Request("http://localhost/test", {
    method: "POST",
    headers: { "Content-Type": contentType, "Content-Length": String(json.length) },
    body: json,
  });
  return createContext(req);
}

function makeFormCtx(params: Record<string, string>): ReturnType<typeof createContext> {
  const body = new URLSearchParams(params).toString();
  const req = new Request("http://localhost/test", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return createContext(req);
}

function makeQueryCtx(query: Record<string, string>): ReturnType<typeof createContext> {
  const qs = new URLSearchParams(query).toString();
  const req = new Request(`http://localhost/test?${qs}`);
  return createContext(req);
}

const nameSchema: Schema = {
  name: { type: "string", required: true, minLength: 1 },
};

describe("bindJSON", () => {
  test("parses valid JSON body", async () => {
    const ctx = makeJSONCtx({ name: "hello" });
    const result = await bindJSON(ctx, nameSchema);
    expect(result.errors).toEqual([]);
    expect(result.data).toEqual({ name: "hello" });
  });

  test("rejects wrong content-type", async () => {
    const ctx = makeJSONCtx({ name: "hello" }, "text/plain");
    const result = await bindJSON(ctx, nameSchema);
    expect(result.errors[0]).toContain("Content-Type");
  });

  test("rejects oversized body", async () => {
    const ctx = makeJSONCtx({ name: "hello" }, "application/json");
    const result = await bindJSON(ctx, nameSchema, { maxBodySize: 2 });
    expect(result.errors[0]).toContain("max size");
  });

  test("rejects invalid JSON", async () => {
    const req = new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json{",
    });
    const ctx = createContext(req);
    const result = await bindJSON(ctx, nameSchema);
    expect(result.errors[0]).toContain("Invalid JSON");
  });

  test("rejects deep nesting", async () => {
    const deep = { a: { b: { c: { d: { e: { f: 1 } } } } } };
    const ctx = makeJSONCtx(deep);
    const result = await bindJSON(ctx, {}, { maxDepth: 3 });
    expect(result.errors[0]).toContain("max depth");
  });

  test("validates against schema", async () => {
    const ctx = makeJSONCtx({});
    const result = await bindJSON(ctx, nameSchema);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("bindForm", () => {
  test("parses valid form body", async () => {
    const ctx = makeFormCtx({ name: "hello" });
    const result = await bindForm(ctx, nameSchema);
    expect(result.errors).toEqual([]);
    expect(result.data).toEqual({ name: "hello" });
  });

  test("rejects wrong content-type", async () => {
    const req = new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "name=hello",
    });
    const ctx = createContext(req);
    const result = await bindForm(ctx, nameSchema);
    expect(result.errors[0]).toContain("Content-Type");
  });

  test("converts number fields", async () => {
    const schema: Schema = { age: { type: "number", required: true } };
    const ctx = makeFormCtx({ age: "25" });
    const result = await bindForm(ctx, schema);
    expect(result.data).toEqual({ age: 25 });
  });

  test("converts boolean fields", async () => {
    const schema: Schema = { active: { type: "boolean", required: true } };
    const ctx = makeFormCtx({ active: "true" });
    const result = await bindForm(ctx, schema);
    expect(result.data).toEqual({ active: true });
  });

  test("rejects oversized form body", async () => {
    const ctx = makeFormCtx({ name: "hello" });
    const result = await bindForm(ctx, nameSchema, { maxBodySize: 2 });
    expect(result.errors[0]).toContain("max size");
  });
});

describe("bindQuery", () => {
  test("parses valid query string", () => {
    const ctx = makeQueryCtx({ name: "hello" });
    const result = bindQuery(ctx, nameSchema);
    expect(result.errors).toEqual([]);
    expect(result.data).toEqual({ name: "hello" });
  });

  test("converts number fields", () => {
    const schema: Schema = { page: { type: "number", required: true } };
    const ctx = makeQueryCtx({ page: "3" });
    const result = bindQuery(ctx, schema);
    expect(result.data).toEqual({ page: 3 });
  });

  test("converts boolean fields", () => {
    const schema: Schema = { debug: { type: "boolean" } };
    const ctx = makeQueryCtx({ debug: "1" });
    const result = bindQuery(ctx, schema);
    expect(result.data).toEqual({ debug: true });
  });

  test("validates against schema", () => {
    const ctx = makeQueryCtx({});
    const result = bindQuery(ctx, nameSchema);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

import { describe, test, expect } from "bun:test";
import { validate, validateBody, validateQuery, type Schema } from "../validator";
import { createContext } from "../context";

describe("validate", () => {
  test("returns valid for empty schema", () => {
    const result = validate({}, {});
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("rejects non-object data", () => {
    const result = validate("string", { name: { type: "string" } });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("data must be a non-null object");
  });

  test("rejects null data", () => {
    const result = validate(null, { name: { type: "string" } });
    expect(result.valid).toBe(false);
  });

  test("rejects array data", () => {
    const result = validate([], { name: { type: "string" } });
    expect(result.valid).toBe(false);
  });

  // required
  test("required field missing returns error", () => {
    const schema: Schema = { name: { type: "string", required: true } };
    const result = validate({}, schema);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("name is required");
  });

  test("required field with null returns error", () => {
    const schema: Schema = { name: { type: "string", required: true } };
    const result = validate({ name: null }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("name is required");
  });

  test("optional field missing is ok", () => {
    const schema: Schema = { name: { type: "string" } };
    const result = validate({}, schema);
    expect(result.valid).toBe(true);
  });

  // type checks
  test("string type check", () => {
    const schema: Schema = { name: { type: "string", required: true } };
    expect(validate({ name: "hello" }, schema).valid).toBe(true);
    expect(validate({ name: 123 }, schema).valid).toBe(false);
  });

  test("number type check", () => {
    const schema: Schema = { age: { type: "number", required: true } };
    expect(validate({ age: 25 }, schema).valid).toBe(true);
    expect(validate({ age: "25" }, schema).valid).toBe(false);
  });

  test("boolean type check", () => {
    const schema: Schema = { active: { type: "boolean", required: true } };
    expect(validate({ active: true }, schema).valid).toBe(true);
    expect(validate({ active: "true" }, schema).valid).toBe(false);
  });

  test("array type check", () => {
    const schema: Schema = { tags: { type: "array", required: true } };
    expect(validate({ tags: [] }, schema).valid).toBe(true);
    expect(validate({ tags: "not-array" }, schema).valid).toBe(false);
  });

  test("object type check", () => {
    const schema: Schema = { meta: { type: "object", required: true } };
    expect(validate({ meta: {} }, schema).valid).toBe(true);
    expect(validate({ meta: [] }, schema).valid).toBe(false);
    expect(validate({ meta: "str" }, schema).valid).toBe(false);
  });

  // min/max for string
  test("string min length", () => {
    const schema: Schema = { name: { type: "string", min: 3 } };
    expect(validate({ name: "ab" }, schema).valid).toBe(false);
    expect(validate({ name: "abc" }, schema).valid).toBe(true);
  });

  test("string max length", () => {
    const schema: Schema = { name: { type: "string", max: 5 } };
    expect(validate({ name: "abcdef" }, schema).valid).toBe(false);
    expect(validate({ name: "abcde" }, schema).valid).toBe(true);
  });

  // min/max for number
  test("number min value", () => {
    const schema: Schema = { age: { type: "number", min: 18 } };
    expect(validate({ age: 17 }, schema).valid).toBe(false);
    expect(validate({ age: 18 }, schema).valid).toBe(true);
  });

  test("number max value", () => {
    const schema: Schema = { age: { type: "number", max: 100 } };
    expect(validate({ age: 101 }, schema).valid).toBe(false);
    expect(validate({ age: 100 }, schema).valid).toBe(true);
  });

  // min/max for array
  test("array min items", () => {
    const schema: Schema = { tags: { type: "array", min: 1 } };
    expect(validate({ tags: [] }, schema).valid).toBe(false);
    expect(validate({ tags: ["a"] }, schema).valid).toBe(true);
  });

  test("array max items", () => {
    const schema: Schema = { tags: { type: "array", max: 2 } };
    expect(validate({ tags: [1, 2, 3] }, schema).valid).toBe(false);
    expect(validate({ tags: [1, 2] }, schema).valid).toBe(true);
  });

  // pattern
  test("string pattern", () => {
    const schema: Schema = { email: { type: "string", pattern: /^.+@.+\..+$/ } };
    expect(validate({ email: "a@b.c" }, schema).valid).toBe(true);
    expect(validate({ email: "invalid" }, schema).valid).toBe(false);
  });

  // enum
  test("enum validation", () => {
    const schema: Schema = { role: { type: "string", enum: ["admin", "user"] as const } };
    expect(validate({ role: "admin" }, schema).valid).toBe(true);
    expect(validate({ role: "superadmin" }, schema).valid).toBe(false);
  });

  // items (array elements)
  test("array items validation", () => {
    const schema: Schema = {
      tags: { type: "array", items: { type: "string", min: 1 } },
    };
    expect(validate({ tags: ["a", "b"] }, schema).valid).toBe(true);
    expect(validate({ tags: ["a", 123] }, schema).valid).toBe(false);
    expect(validate({ tags: ["a", ""] }, schema).valid).toBe(false);
  });

  // properties (nested object)
  test("object properties validation", () => {
    const schema: Schema = {
      address: {
        type: "object",
        properties: {
          city: { type: "string", required: true },
          zip: { type: "string", pattern: /^\d{5}$/ },
        },
      },
    };
    expect(validate({ address: { city: "NY", zip: "12345" } }, schema).valid).toBe(true);
    expect(validate({ address: { zip: "12345" } }, schema).valid).toBe(false);
    expect(validate({ address: { city: "NY", zip: "abc" } }, schema).valid).toBe(false);
  });

  // custom
  test("custom validator", () => {
    const schema: Schema = {
      age: {
        type: "number",
        custom: (v) => (typeof v === "number" && v % 2 === 0 ? null : "must be even"),
      },
    };
    expect(validate({ age: 4 }, schema).valid).toBe(true);
    expect(validate({ age: 3 }, schema).valid).toBe(false);
  });

  // collects all errors
  test("collects all field errors", () => {
    const schema: Schema = {
      name: { type: "string", required: true },
      age: { type: "number", required: true },
      email: { type: "string", required: true },
    };
    const result = validate({}, schema);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(3);
  });
});

describe("validateBody", () => {
  test("passes valid body", async () => {
    const schema: Schema = { name: { type: "string", required: true } };
    const mw = validateBody(schema);
    const request = new Request("http://localhost/", {
      method: "POST",
      body: JSON.stringify({ name: "Alice" }),
      headers: { "Content-Type": "application/json" },
    });
    const ctx = createContext(request);
    const response = await mw(ctx, () => Promise.resolve(ctx.json({ ok: true })));
    expect(response.status).toBe(200);
  });

  test("rejects invalid body with 400", async () => {
    const schema: Schema = { name: { type: "string", required: true } };
    const mw = validateBody(schema);
    const request = new Request("http://localhost/", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const ctx = createContext(request);
    const response = await mw(ctx, () => Promise.resolve(ctx.json({ ok: true })));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.errors).toContain("name is required");
  });

  test("rejects invalid JSON with 400", async () => {
    const schema: Schema = { name: { type: "string", required: true } };
    const mw = validateBody(schema);
    const request = new Request("http://localhost/", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const ctx = createContext(request);
    const response = await mw(ctx, () => Promise.resolve(ctx.json({ ok: true })));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid JSON body");
  });
});

describe("validateQuery", () => {
  test("passes valid query", async () => {
    const schema: Schema = { page: { type: "string", required: true } };
    const mw = validateQuery(schema);
    const request = new Request("http://localhost/?page=1");
    const ctx = createContext(request);
    const response = await mw(ctx, () => Promise.resolve(ctx.json({ ok: true })));
    expect(response.status).toBe(200);
  });

  test("rejects invalid query with 400", async () => {
    const schema: Schema = { page: { type: "string", required: true } };
    const mw = validateQuery(schema);
    const request = new Request("http://localhost/");
    const ctx = createContext(request);
    const response = await mw(ctx, () => Promise.resolve(ctx.json({ ok: true })));
    expect(response.status).toBe(400);
  });
});

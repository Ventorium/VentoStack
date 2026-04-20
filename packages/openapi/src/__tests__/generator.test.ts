import { describe, expect, test } from "bun:test";
import { createOpenAPIGenerator, toYAML } from "../generator";
import { schemaObject, schemaString, schemaInteger, schemaArray } from "../schema-builder";

describe("createOpenAPIGenerator", () => {
  test("setInfo sets document info", () => {
    const gen = createOpenAPIGenerator();
    gen.setInfo({ title: "Test API", version: "1.0.0" });
    const doc = gen.generate();
    expect(doc.info).toEqual({ title: "Test API", version: "1.0.0" });
  });

  test("addServer adds servers", () => {
    const gen = createOpenAPIGenerator();
    gen.setInfo({ title: "API", version: "1.0.0" });
    gen.addServer({ url: "https://api.example.com", description: "Production" });
    gen.addServer({ url: "http://localhost:3000", description: "Dev" });
    const doc = gen.generate();
    expect(doc.servers).toHaveLength(2);
    expect(doc.servers![0]!.url).toBe("https://api.example.com");
    expect(doc.servers![1]!.description).toBe("Dev");
  });

  test("addTag adds tags", () => {
    const gen = createOpenAPIGenerator();
    gen.setInfo({ title: "API", version: "1.0.0" });
    gen.addTag("users", "User operations");
    gen.addTag("auth");
    const doc = gen.generate();
    expect(doc.tags).toHaveLength(2);
    expect(doc.tags![0]).toEqual({ name: "users", description: "User operations" });
    expect(doc.tags![1]).toEqual({ name: "auth" });
  });

  test("addSchema adds component schema", () => {
    const gen = createOpenAPIGenerator();
    gen.setInfo({ title: "API", version: "1.0.0" });
    const userSchema = schemaObject(
      { id: schemaInteger(), name: schemaString() },
      ["id", "name"],
    );
    gen.addSchema("User", userSchema);
    const doc = gen.generate();
    expect(doc.components?.schemas?.["User"]).toEqual(userSchema);
  });

  test("addSecurityScheme adds security scheme", () => {
    const gen = createOpenAPIGenerator();
    gen.setInfo({ title: "API", version: "1.0.0" });
    gen.addSecurityScheme("bearerAuth", {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    });
    const doc = gen.generate();
    expect(doc.components?.securitySchemes?.["bearerAuth"]).toEqual({
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    });
  });

  test("addPath adds GET operation", () => {
    const gen = createOpenAPIGenerator();
    gen.setInfo({ title: "API", version: "1.0.0" });
    gen.addPath("/users", "GET", {
      summary: "List users",
      responses: { "200": { description: "Success" } },
    });
    const doc = gen.generate();
    expect(doc.paths["/users"]?.get?.summary).toBe("List users");
  });

  test("addPath adds POST operation", () => {
    const gen = createOpenAPIGenerator();
    gen.setInfo({ title: "API", version: "1.0.0" });
    gen.addPath("/users", "POST", {
      summary: "Create user",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: schemaObject({ name: schemaString() }, ["name"]),
          },
        },
      },
      responses: { "201": { description: "Created" } },
    });
    const doc = gen.generate();
    expect(doc.paths["/users"]?.post?.summary).toBe("Create user");
    expect(doc.paths["/users"]?.post?.requestBody?.required).toBe(true);
  });

  test("addPath throws on invalid method", () => {
    const gen = createOpenAPIGenerator();
    expect(() =>
      gen.addPath("/x", "INVALID", { responses: { "200": { description: "OK" } } }),
    ).toThrow("Invalid HTTP method");
  });

  test("generate produces complete document", () => {
    const gen = createOpenAPIGenerator();
    gen.setInfo({ title: "Full API", version: "2.0.0", description: "A full API" });
    gen.addServer({ url: "https://api.example.com" });
    gen.addTag("items");
    gen.addSchema("Item", schemaObject({ id: schemaInteger() }, ["id"]));
    gen.addSecurityScheme("apiKey", { type: "apiKey", in: "header", name: "X-API-Key" });
    gen.addPath("/items", "GET", {
      tags: ["items"],
      responses: { "200": { description: "OK" } },
    });
    gen.addPath("/items", "POST", {
      tags: ["items"],
      responses: { "201": { description: "Created" } },
    });

    const doc = gen.generate();
    expect(doc.openapi).toBe("3.0.3");
    expect(doc.info.title).toBe("Full API");
    expect(doc.servers).toHaveLength(1);
    expect(doc.tags).toHaveLength(1);
    expect(doc.components?.schemas?.["Item"]).toBeDefined();
    expect(doc.components?.securitySchemes?.["apiKey"]).toBeDefined();
    expect(doc.paths["/items"]?.get).toBeDefined();
    expect(doc.paths["/items"]?.post).toBeDefined();
  });

  test("toJSON outputs valid JSON", () => {
    const gen = createOpenAPIGenerator();
    gen.setInfo({ title: "JSON Test", version: "1.0.0" });
    gen.addPath("/test", "GET", {
      responses: { "200": { description: "OK" } },
    });
    const json = gen.toJSON();
    const parsed = JSON.parse(json);
    expect(parsed.openapi).toBe("3.0.3");
    expect(parsed.info.title).toBe("JSON Test");
    expect(parsed.paths["/test"].get.responses["200"].description).toBe("OK");
  });

  test("toYAML outputs YAML string", () => {
    const gen = createOpenAPIGenerator();
    gen.setInfo({ title: "YAML Test", version: "1.0.0" });
    gen.addPath("/ping", "GET", {
      responses: { "200": { description: "Pong" } },
    });
    const yaml = gen.toYAML();
    expect(yaml).toContain("openapi: 3.0.3");
    expect(yaml).toContain("title: YAML Test");
    expect(yaml).toContain("/ping");
  });

  test("multiple paths and methods", () => {
    const gen = createOpenAPIGenerator();
    gen.setInfo({ title: "Multi", version: "1.0.0" });
    gen.addPath("/a", "GET", { responses: { "200": { description: "OK" } } });
    gen.addPath("/a", "POST", { responses: { "201": { description: "Created" } } });
    gen.addPath("/b", "PUT", { responses: { "200": { description: "Updated" } } });
    gen.addPath("/b", "DELETE", { responses: { "204": { description: "Deleted" } } });
    gen.addPath("/c", "PATCH", { responses: { "200": { description: "Patched" } } });

    const doc = gen.generate();
    expect(doc.paths["/a"]?.get).toBeDefined();
    expect(doc.paths["/a"]?.post).toBeDefined();
    expect(doc.paths["/b"]?.put).toBeDefined();
    expect(doc.paths["/b"]?.delete).toBeDefined();
    expect(doc.paths["/c"]?.patch).toBeDefined();
  });

  test("no components when empty", () => {
    const gen = createOpenAPIGenerator();
    gen.setInfo({ title: "Minimal", version: "0.1.0" });
    const doc = gen.generate();
    expect(doc.components).toBeUndefined();
    expect(doc.servers).toBeUndefined();
    expect(doc.tags).toBeUndefined();
  });
});

describe("toYAML standalone", () => {
  test("serializes primitives", () => {
    expect(toYAML({ key: "value" })).toContain("key: value");
    expect(toYAML({ num: 42 })).toContain("num: 42");
    expect(toYAML({ flag: true })).toContain("flag: true");
    expect(toYAML({ empty: null })).toContain("empty: null");
  });

  test("serializes nested objects", () => {
    const yaml = toYAML({ a: { b: { c: "deep" } } });
    expect(yaml).toContain("a:");
    expect(yaml).toContain("b:");
    expect(yaml).toContain("c: deep");
  });

  test("serializes arrays", () => {
    const yaml = toYAML({ items: [1, 2, 3] });
    expect(yaml).toContain("- 1");
    expect(yaml).toContain("- 2");
    expect(yaml).toContain("- 3");
  });

  test("escapes special strings", () => {
    const yaml = toYAML({ val: "true", empty: "", colon: "a: b" });
    expect(yaml).toContain('val: "true"');
    expect(yaml).toContain('empty: ""');
    expect(yaml).toContain('colon: "a: b"');
  });
});

import { describe, expect, test } from "bun:test";
import { routeConfigToOpenAPIOperation, schemaFieldToOpenAPI, schemaToOpenAPIObject } from "../from-router";

describe("schemaFieldToOpenAPI", () => {
  test("converts string field", () => {
    const schema = schemaFieldToOpenAPI({ type: "string", min: 1, max: 100, description: "用户名" });
    expect(schema).toEqual({
      type: "string",
      minLength: 1,
      maxLength: 100,
      description: "用户名",
    });
  });

  test("converts int field", () => {
    const schema = schemaFieldToOpenAPI({ type: "int", min: 0, max: 100 });
    expect(schema).toEqual({
      type: "integer",
      minimum: 0,
      maximum: 100,
    });
  });

  test("converts bool field", () => {
    const schema = schemaFieldToOpenAPI({ type: "bool" });
    expect(schema).toEqual({ type: "boolean" });
  });

  test("converts date field", () => {
    const schema = schemaFieldToOpenAPI({ type: "date" });
    expect(schema).toEqual({ type: "string", format: "date-time" });
  });

  test("converts uuid field", () => {
    const schema = schemaFieldToOpenAPI({ type: "uuid" });
    expect(schema).toEqual({ type: "string" });
  });

  test("converts file field", () => {
    const schema = schemaFieldToOpenAPI({ type: "file" });
    expect(schema).toEqual({ type: "string", format: "binary" });
  });

  test("converts array field", () => {
    const schema = schemaFieldToOpenAPI({ type: "array", items: { type: "int" } });
    expect(schema).toEqual({
      type: "array",
      items: { type: "integer" },
    });
  });

  test("converts object field", () => {
    const schema = schemaFieldToOpenAPI({
      type: "object",
      properties: {
        name: { type: "string", required: true },
        age: { type: "int" },
      },
    });
    expect(schema).toEqual({
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "integer" },
      },
      required: ["name"],
    });
  });
});

describe("routeConfigToOpenAPIOperation", () => {
  test("generates operation with query params", () => {
    const operation = routeConfigToOpenAPIOperation({
      query: {
        page: { type: "int", default: 1, description: "页码" },
        limit: { type: "int", default: 20 },
        search: { type: "string" },
      },
    });

    expect(operation.parameters).toHaveLength(3);
    expect(operation.parameters?.[0]).toEqual({
      name: "page",
      in: "query",
      description: "页码",
      schema: { type: "integer", description: "页码" },
    });
  });

  test("generates operation with body", () => {
    const operation = routeConfigToOpenAPIOperation({
      body: {
        name: { type: "string", required: true },
        age: { type: "int" },
      },
    });

    expect(operation.requestBody).toEqual({
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              name: { type: "string" },
              age: { type: "integer" },
            },
            required: ["name"],
          },
        },
      },
    });
  });

  test("generates operation with formData", () => {
    const operation = routeConfigToOpenAPIOperation({
      formData: {
        title: { type: "string", required: true },
        avatar: { type: "file" },
      },
    });

    expect(operation.requestBody?.content["multipart/form-data"]).toBeDefined();
    expect(operation.requestBody?.content["multipart/form-data"].schema.type).toBe("object");
  });

  test("generates operation with headers", () => {
    const operation = routeConfigToOpenAPIOperation({
      headers: {
        authorization: { type: "string", required: true },
      },
    });

    expect(operation.parameters).toHaveLength(1);
    expect(operation.parameters?.[0]).toEqual({
      name: "authorization",
      in: "header",
      required: true,
      schema: { type: "string" },
    });
  });

  test("generates operation with responses", () => {
    const operation = routeConfigToOpenAPIOperation({
      responses: {
        200: {
          id: { type: "int" },
          name: { type: "string" },
        },
        201: {
          id: { type: "int" },
        },
      },
    });

    expect(operation.responses["200"]).toBeDefined();
    expect(operation.responses["200"].content?.["application/json"].schema.type).toBe("object");
    expect(operation.responses["201"]).toBeDefined();
  });

  test("generates operation with non-json response content type", () => {
    const operation = routeConfigToOpenAPIOperation({
      responses: {
        200: {
          contentType: "text/plain",
          schema: { type: "string" },
        },
      },
    });

    expect(operation.responses["200"]?.content?.["text/plain"]?.schema.type).toBe("string");
    expect(operation.responses["200"]?.content?.["application/json"]).toBeUndefined();
  });

  test("includes default 200 response when no responses config", () => {
    const operation = routeConfigToOpenAPIOperation({
      query: { page: { type: "int" } },
    });

    expect(operation.responses["200"]).toEqual({ description: "Success" });
  });

  test("generates combined operation", () => {
    const operation = routeConfigToOpenAPIOperation({
      query: { page: { type: "int" } },
      headers: { authorization: { type: "string", required: true } },
      body: { name: { type: "string", required: true } },
      responses: {
        200: { id: { type: "int" } },
      },
    });

    expect(operation.parameters).toHaveLength(2); // query + header
    expect(operation.requestBody).toBeDefined();
    expect(operation.responses["200"]).toBeDefined();
  });
});

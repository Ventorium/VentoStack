import { describe, expect, test } from "bun:test";
import { defineRouteDoc, routesToOpenAPI } from "../decorators";
import { createOpenAPIGenerator } from "../generator";
import { schemaObject, schemaString, schemaInteger } from "../schema-builder";

describe("defineRouteDoc", () => {
  test("returns basic route metadata", () => {
    const meta = defineRouteDoc({
      path: "/users",
      method: "GET",
      summary: "List users",
    });
    expect(meta.path).toBe("/users");
    expect(meta.method).toBe("GET");
    expect(meta.summary).toBe("List users");
  });

  test("returns metadata with parameters", () => {
    const meta = defineRouteDoc({
      path: "/users/{id}",
      method: "GET",
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
      ],
    });
    expect(meta.parameters).toHaveLength(1);
    expect(meta.parameters![0]!.name).toBe("id");
    expect(meta.parameters![0]!.in).toBe("path");
  });

  test("returns metadata with requestBody", () => {
    const meta = defineRouteDoc({
      path: "/users",
      method: "POST",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: schemaObject({ name: schemaString() }, ["name"]),
          },
        },
      },
    });
    expect(meta.requestBody?.required).toBe(true);
  });

  test("returns metadata with responses", () => {
    const meta = defineRouteDoc({
      path: "/users",
      method: "GET",
      responses: {
        "200": {
          description: "Success",
          content: {
            "application/json": {
              schema: schemaObject({ id: schemaInteger(), name: schemaString() }),
            },
          },
        },
        "404": { description: "Not found" },
      },
    });
    expect(Object.keys(meta.responses!)).toHaveLength(2);
  });
});

describe("routesToOpenAPI", () => {
  test("single route", () => {
    const gen = createOpenAPIGenerator();
    gen.setInfo({ title: "Test", version: "1.0.0" });

    routesToOpenAPI(
      [
        defineRouteDoc({
          path: "/health",
          method: "GET",
          summary: "Health check",
          responses: { "200": { description: "OK" } },
        }),
      ],
      gen,
    );

    const doc = gen.generate();
    expect(doc.paths["/health"]?.get?.summary).toBe("Health check");
  });

  test("multiple routes", () => {
    const gen = createOpenAPIGenerator();
    gen.setInfo({ title: "Test", version: "1.0.0" });

    routesToOpenAPI(
      [
        defineRouteDoc({ path: "/a", method: "GET" }),
        defineRouteDoc({ path: "/b", method: "POST" }),
        defineRouteDoc({ path: "/c", method: "DELETE" }),
      ],
      gen,
    );

    const doc = gen.generate();
    expect(doc.paths["/a"]?.get).toBeDefined();
    expect(doc.paths["/b"]?.post).toBeDefined();
    expect(doc.paths["/c"]?.delete).toBeDefined();
  });

  test("routes with tags", () => {
    const gen = createOpenAPIGenerator();
    gen.setInfo({ title: "Test", version: "1.0.0" });

    routesToOpenAPI(
      [
        defineRouteDoc({
          path: "/users",
          method: "GET",
          tags: ["users"],
        }),
        defineRouteDoc({
          path: "/users",
          method: "POST",
          tags: ["users", "admin"],
        }),
      ],
      gen,
    );

    const doc = gen.generate();
    expect(doc.paths["/users"]?.get?.tags).toEqual(["users"]);
    expect(doc.paths["/users"]?.post?.tags).toEqual(["users", "admin"]);
  });

  test("routes with security", () => {
    const gen = createOpenAPIGenerator();
    gen.setInfo({ title: "Test", version: "1.0.0" });

    routesToOpenAPI(
      [
        defineRouteDoc({
          path: "/admin",
          method: "GET",
          security: [{ bearerAuth: [] }],
        }),
      ],
      gen,
    );

    const doc = gen.generate();
    expect(doc.paths["/admin"]?.get?.security).toEqual([{ bearerAuth: [] }]);
  });

  test("route with default 200 response when none specified", () => {
    const gen = createOpenAPIGenerator();
    gen.setInfo({ title: "Test", version: "1.0.0" });

    routesToOpenAPI(
      [defineRouteDoc({ path: "/ping", method: "GET" })],
      gen,
    );

    const doc = gen.generate();
    expect(doc.paths["/ping"]?.get?.responses["200"]?.description).toBe("Success");
  });

  test("route with deprecated flag", () => {
    const gen = createOpenAPIGenerator();
    gen.setInfo({ title: "Test", version: "1.0.0" });

    routesToOpenAPI(
      [
        defineRouteDoc({
          path: "/old",
          method: "GET",
          deprecated: true,
          responses: { "200": { description: "OK" } },
        }),
      ],
      gen,
    );

    const doc = gen.generate();
    expect(doc.paths["/old"]?.get?.deprecated).toBe(true);
  });

  test("route with operationId and description", () => {
    const gen = createOpenAPIGenerator();
    gen.setInfo({ title: "Test", version: "1.0.0" });

    routesToOpenAPI(
      [
        defineRouteDoc({
          path: "/users/{id}",
          method: "GET",
          operationId: "getUserById",
          description: "Fetch a single user by ID",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "User ID",
            },
          ],
          responses: {
            "200": { description: "User found" },
            "404": { description: "User not found" },
          },
        }),
      ],
      gen,
    );

    const doc = gen.generate();
    const op = doc.paths["/users/{id}"]?.get;
    expect(op?.operationId).toBe("getUserById");
    expect(op?.description).toBe("Fetch a single user by ID");
    expect(op?.parameters).toHaveLength(1);
  });

  test("full integration with generator", () => {
    const gen = createOpenAPIGenerator();
    gen.setInfo({ title: "My API", version: "1.0.0", description: "Full test" });
    gen.addServer({ url: "https://api.example.com" });
    gen.addTag("users", "User endpoints");
    gen.addSchema(
      "User",
      schemaObject({ id: schemaInteger(), name: schemaString() }, ["id", "name"]),
    );
    gen.addSecurityScheme("bearerAuth", {
      type: "http",
      scheme: "bearer",
    });

    routesToOpenAPI(
      [
        defineRouteDoc({
          path: "/users",
          method: "GET",
          tags: ["users"],
          summary: "List users",
          responses: {
            "200": {
              description: "OK",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/User" } },
                },
              },
            },
          },
        }),
        defineRouteDoc({
          path: "/users",
          method: "POST",
          tags: ["users"],
          summary: "Create user",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: schemaObject({ name: schemaString() }, ["name"]),
              },
            },
          },
          responses: {
            "201": { description: "Created" },
          },
        }),
      ],
      gen,
    );

    const doc = gen.generate();
    expect(doc.openapi).toBe("3.0.3");
    expect(doc.paths["/users"]?.get).toBeDefined();
    expect(doc.paths["/users"]?.post).toBeDefined();
    expect(doc.components?.schemas?.["User"]).toBeDefined();

    const json = gen.toJSON();
    expect(JSON.parse(json).openapi).toBe("3.0.3");
  });
});

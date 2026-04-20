import { describe, expect, test } from "bun:test";
import {
  schemaString,
  schemaNumber,
  schemaInteger,
  schemaBoolean,
  schemaArray,
  schemaObject,
  schemaEnum,
  schemaRef,
} from "../schema-builder";

describe("schemaString", () => {
  test("basic string schema", () => {
    const s = schemaString();
    expect(s).toEqual({ type: "string" });
  });

  test("string with constraints", () => {
    const s = schemaString({
      minLength: 1,
      maxLength: 255,
      pattern: "^[a-z]+$",
      format: "email",
      description: "User email",
      example: "user@example.com",
    });
    expect(s).toEqual({
      type: "string",
      minLength: 1,
      maxLength: 255,
      pattern: "^[a-z]+$",
      format: "email",
      description: "User email",
      example: "user@example.com",
    });
  });

  test("string with partial options", () => {
    const s = schemaString({ format: "date-time" });
    expect(s).toEqual({ type: "string", format: "date-time" });
  });
});

describe("schemaNumber", () => {
  test("basic number schema", () => {
    const s = schemaNumber();
    expect(s).toEqual({ type: "number" });
  });

  test("number with range", () => {
    const s = schemaNumber({
      minimum: 0,
      maximum: 100,
      format: "double",
      description: "Score",
      example: 95.5,
    });
    expect(s).toEqual({
      type: "number",
      minimum: 0,
      maximum: 100,
      format: "double",
      description: "Score",
      example: 95.5,
    });
  });
});

describe("schemaInteger", () => {
  test("basic integer schema", () => {
    const s = schemaInteger();
    expect(s).toEqual({ type: "integer" });
  });

  test("integer with constraints", () => {
    const s = schemaInteger({ minimum: 1, maximum: 1000, description: "Age", example: 25 });
    expect(s).toEqual({
      type: "integer",
      minimum: 1,
      maximum: 1000,
      description: "Age",
      example: 25,
    });
  });
});

describe("schemaBoolean", () => {
  test("basic boolean schema", () => {
    const s = schemaBoolean();
    expect(s).toEqual({ type: "boolean" });
  });

  test("boolean with description", () => {
    const s = schemaBoolean({ description: "Is active", example: true });
    expect(s).toEqual({ type: "boolean", description: "Is active", example: true });
  });
});

describe("schemaArray", () => {
  test("array of strings", () => {
    const s = schemaArray(schemaString());
    expect(s).toEqual({ type: "array", items: { type: "string" } });
  });

  test("array with description", () => {
    const s = schemaArray(schemaInteger(), { description: "List of IDs" });
    expect(s).toEqual({
      type: "array",
      items: { type: "integer" },
      description: "List of IDs",
    });
  });
});

describe("schemaObject", () => {
  test("object with properties and required", () => {
    const s = schemaObject(
      {
        name: schemaString(),
        age: schemaInteger(),
      },
      ["name"],
    );
    expect(s).toEqual({
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "integer" },
      },
      required: ["name"],
    });
  });

  test("object without required", () => {
    const s = schemaObject({ flag: schemaBoolean() });
    expect(s).toEqual({
      type: "object",
      properties: { flag: { type: "boolean" } },
    });
  });

  test("object with empty required array omits required", () => {
    const s = schemaObject({ x: schemaString() }, []);
    expect(s.required).toBeUndefined();
  });

  test("object with description", () => {
    const s = schemaObject(
      { id: schemaString() },
      ["id"],
      { description: "A user" },
    );
    expect(s.description).toBe("A user");
  });
});

describe("schemaEnum", () => {
  test("enum values", () => {
    const s = schemaEnum(["admin", "user", "guest"]);
    expect(s).toEqual({ enum: ["admin", "user", "guest"] });
  });

  test("enum with description", () => {
    const s = schemaEnum([1, 2, 3], { description: "Status code" });
    expect(s).toEqual({ enum: [1, 2, 3], description: "Status code" });
  });
});

describe("schemaRef", () => {
  test("creates $ref", () => {
    const s = schemaRef("User");
    expect(s).toEqual({ $ref: "#/components/schemas/User" });
  });
});

describe("nested schemas", () => {
  test("deeply nested object with array", () => {
    const s = schemaObject(
      {
        users: schemaArray(
          schemaObject(
            {
              id: schemaInteger(),
              name: schemaString(),
              roles: schemaArray(schemaEnum(["admin", "user"])),
            },
            ["id", "name"],
          ),
        ),
      },
      ["users"],
    );

    expect(s.type).toBe("object");
    expect(s.required).toEqual(["users"]);
    const users = s.properties!["users"]!;
    expect(users.type).toBe("array");
    const item = users.items!;
    expect(item.type).toBe("object");
    expect(item.required).toEqual(["id", "name"]);
    expect(item.properties!["roles"]!.type).toBe("array");
    expect(item.properties!["roles"]!.items!.enum).toEqual(["admin", "user"]);
  });
});

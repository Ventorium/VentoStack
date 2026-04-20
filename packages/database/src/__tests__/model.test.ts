import { describe, expect, test } from "bun:test";
import { column, defineModel } from "../model";

describe("column", () => {
  test("bigint creates correct column def", () => {
    const col = column.bigint();
    expect(col.type).toBe("bigint");
    expect(col.options).toEqual({});
  });

  test("bigint with options", () => {
    const col = column.bigint({ primary: true, autoIncrement: true });
    expect(col.type).toBe("bigint");
    expect(col.options.primary).toBe(true);
    expect(col.options.autoIncrement).toBe(true);
  });

  test("int creates correct column def", () => {
    const col = column.int({ nullable: true });
    expect(col.type).toBe("int");
    expect(col.options.nullable).toBe(true);
  });

  test("varchar creates correct column def", () => {
    const col = column.varchar({ length: 255, unique: true });
    expect(col.type).toBe("varchar");
    expect(col.options.length).toBe(255);
    expect(col.options.unique).toBe(true);
  });

  test("text creates correct column def", () => {
    const col = column.text({ comment: "description field" });
    expect(col.type).toBe("text");
    expect(col.options.comment).toBe("description field");
  });

  test("boolean creates correct column def", () => {
    const col = column.boolean({ default: false });
    expect(col.type).toBe("boolean");
    expect(col.options.default).toBe(false);
  });

  test("timestamp creates correct column def", () => {
    const col = column.timestamp();
    expect(col.type).toBe("timestamp");
  });

  test("json creates correct column def", () => {
    const col = column.json({ nullable: true });
    expect(col.type).toBe("json");
    expect(col.options.nullable).toBe(true);
  });

  test("enum creates correct column def with values", () => {
    const col = column.enum({ values: ["active", "inactive", "banned"] as const });
    expect(col.type).toBe("enum");
    expect(col.options.values).toEqual(["active", "inactive", "banned"]);
  });

  test("decimal creates correct column def", () => {
    const col = column.decimal({ precision: 10, scale: 2 });
    expect(col.type).toBe("decimal");
    expect((col.options as { precision?: number }).precision).toBe(10);
    expect((col.options as { scale?: number }).scale).toBe(2);
  });
});

describe("defineModel", () => {
  test("creates model with defaults", () => {
    const model = defineModel("users", {
      id: column.bigint({ primary: true, autoIncrement: true }),
      name: column.varchar({ length: 100 }),
    });

    expect(model.tableName).toBe("users");
    expect(model.columns.id.type).toBe("bigint");
    expect(model.columns.name.type).toBe("varchar");
    expect(model.options.timestamps).toBe(true);
    expect(model.options.softDelete).toBe(false);
  });

  test("creates model with custom options", () => {
    const model = defineModel(
      "posts",
      {
        id: column.bigint({ primary: true }),
        title: column.varchar({ length: 200 }),
      },
      { softDelete: true, timestamps: false, comment: "Blog posts" },
    );

    expect(model.tableName).toBe("posts");
    expect(model.options.softDelete).toBe(true);
    expect(model.options.timestamps).toBe(false);
    expect(model.options.comment).toBe("Blog posts");
  });

  test("model has $type marker", () => {
    const model = defineModel("tags", {
      id: column.int({ primary: true }),
      label: column.varchar(),
    });

    expect(model).toHaveProperty("$type");
  });

  test("all column types in a model", () => {
    const model = defineModel("everything", {
      id: column.bigint({ primary: true, autoIncrement: true }),
      count: column.int(),
      name: column.varchar({ length: 255 }),
      bio: column.text(),
      active: column.boolean({ default: true }),
      createdAt: column.timestamp(),
      metadata: column.json(),
      status: column.enum({ values: ["a", "b"] as const }),
      price: column.decimal({ precision: 8, scale: 2 }),
    });

    expect(Object.keys(model.columns)).toHaveLength(9);
  });
});

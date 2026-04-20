import { describe, test, expect } from "bun:test";
import { diffSchemas, generateMigrationSQL } from "../schema-diff";

describe("diffSchemas", () => {
  test("detects added tables", () => {
    const diff = diffSchemas([], [{ name: "users", columns: [{ name: "id", type: "int" }] }]);
    expect(diff.addedTables).toEqual(["users"]);
    expect(diff.removedTables).toEqual([]);
  });

  test("detects removed tables", () => {
    const diff = diffSchemas([{ name: "users", columns: [{ name: "id", type: "int" }] }], []);
    expect(diff.removedTables).toEqual(["users"]);
    expect(diff.addedTables).toEqual([]);
  });

  test("detects added columns", () => {
    const current = [{ name: "users", columns: [{ name: "id", type: "int" }] }];
    const target = [{ name: "users", columns: [{ name: "id", type: "int" }, { name: "name", type: "varchar" }] }];
    const diff = diffSchemas(current, target);
    expect(diff.modifiedTables).toHaveLength(1);
    expect(diff.modifiedTables[0].addedColumns).toHaveLength(1);
    expect(diff.modifiedTables[0].addedColumns[0].name).toBe("name");
  });

  test("detects removed columns", () => {
    const current = [{ name: "users", columns: [{ name: "id", type: "int" }, { name: "name", type: "varchar" }] }];
    const target = [{ name: "users", columns: [{ name: "id", type: "int" }] }];
    const diff = diffSchemas(current, target);
    expect(diff.modifiedTables[0].removedColumns).toEqual(["name"]);
  });

  test("detects type changes", () => {
    const current = [{ name: "users", columns: [{ name: "age", type: "int" }] }];
    const target = [{ name: "users", columns: [{ name: "age", type: "bigint" }] }];
    const diff = diffSchemas(current, target);
    expect(diff.modifiedTables[0].modifiedColumns).toHaveLength(1);
    expect(diff.modifiedTables[0].modifiedColumns[0].changes).toContain("type");
  });

  test("detects nullable changes", () => {
    const current = [{ name: "users", columns: [{ name: "name", type: "varchar", nullable: true }] }];
    const target = [{ name: "users", columns: [{ name: "name", type: "varchar", nullable: false }] }];
    const diff = diffSchemas(current, target);
    expect(diff.modifiedTables[0].modifiedColumns[0].changes).toContain("nullable");
  });

  test("no changes returns empty diff", () => {
    const schema = [{ name: "users", columns: [{ name: "id", type: "int" }] }];
    const diff = diffSchemas(schema, schema);
    expect(diff.addedTables).toEqual([]);
    expect(diff.removedTables).toEqual([]);
    expect(diff.modifiedTables).toEqual([]);
  });
});

describe("generateMigrationSQL", () => {
  test("generates add table SQL", () => {
    const diff = diffSchemas([], [{ name: "users", columns: [] }]);
    const { up, down } = generateMigrationSQL(diff);
    expect(up[0]).toContain("CREATE TABLE users");
    expect(down[0]).toContain("DROP TABLE");
  });

  test("generates add column SQL", () => {
    const current = [{ name: "users", columns: [{ name: "id", type: "int" }] }];
    const target = [{ name: "users", columns: [{ name: "id", type: "int" }, { name: "email", type: "varchar", nullable: false }] }];
    const diff = diffSchemas(current, target);
    const { up, down } = generateMigrationSQL(diff);
    expect(up[0]).toContain("ADD COLUMN email varchar NOT NULL");
    expect(down[0]).toContain("DROP COLUMN email");
  });

  test("generates type change SQL", () => {
    const current = [{ name: "t", columns: [{ name: "x", type: "int" }] }];
    const target = [{ name: "t", columns: [{ name: "x", type: "bigint" }] }];
    const diff = diffSchemas(current, target);
    const { up, down } = generateMigrationSQL(diff);
    expect(up[0]).toContain("ALTER COLUMN x TYPE bigint");
    expect(down[0]).toContain("ALTER COLUMN x TYPE int");
  });
});

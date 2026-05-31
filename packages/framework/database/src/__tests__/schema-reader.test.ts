import { describe, expect, mock, test } from "bun:test";
import { listTables, readTableSchema } from "../schema-reader";

function createMockExecutor() {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const executor = mock(async (text: string, params?: unknown[]): Promise<unknown[]> => {
    calls.push({ text, params });
    return [];
  });
  return { executor, calls };
}

describe("schema-reader", () => {
  describe("listTables", () => {
    test("returns table names from information_schema", async () => {
      const { executor } = createMockExecutor();
      executor.mockResolvedValueOnce([
        { table_name: "users" },
        { table_name: "posts" },
        { table_name: "comments" },
      ]);
      const tables = await listTables(executor);
      expect(tables).toEqual(["users", "posts", "comments"]);
      expect(executor).toHaveBeenCalledTimes(1);
      expect(executor.mock.calls[0]![0]).toContain("information_schema.tables");
    });

    test("returns empty array when no tables", async () => {
      const { executor } = createMockExecutor();
      executor.mockResolvedValueOnce([]);
      const tables = await listTables(executor);
      expect(tables).toEqual([]);
    });
  });

  describe("readTableSchema", () => {
    test("returns columns with correct types", async () => {
      const { executor } = createMockExecutor();
      // columns query
      executor.mockResolvedValueOnce([
        {
          column_name: "id",
          data_type: "bigint",
          is_nullable: "NO",
          column_default: "nextval('users_id_seq'::regclass)",
          ordinal_position: 1,
        },
        {
          column_name: "name",
          data_type: "character varying",
          is_nullable: "YES",
          column_default: null,
          ordinal_position: 2,
        },
        {
          column_name: "email",
          data_type: "character varying",
          is_nullable: "NO",
          column_default: null,
          ordinal_position: 3,
        },
      ]);
      // primary key query
      executor.mockResolvedValueOnce([{ column_name: "id" }]);
      // index query
      executor.mockResolvedValueOnce([
        { index_name: "users_pkey", column_name: "id", is_unique: true },
        { index_name: "users_email_idx", column_name: "email", is_unique: true },
      ]);

      const schema = await readTableSchema(executor, "users");
      expect(schema.tableName).toBe("users");
      expect(schema.columns).toHaveLength(3);
      expect(schema.columns[0]).toEqual({
        name: "id",
        type: "bigint",
        nullable: false,
        defaultValue: "nextval('users_id_seq'::regclass)",
        isPrimary: true,
      });
      expect(schema.columns[1]).toEqual({
        name: "name",
        type: "character varying",
        nullable: true,
        defaultValue: null,
        isPrimary: false,
      });
      expect(schema.columns[2]).toEqual({
        name: "email",
        type: "character varying",
        nullable: false,
        defaultValue: null,
        isPrimary: false,
      });
    });

    test("identifies primary key columns", async () => {
      const { executor } = createMockExecutor();
      // columns
      executor.mockResolvedValueOnce([
        {
          column_name: "user_id",
          data_type: "bigint",
          is_nullable: "NO",
          column_default: null,
          ordinal_position: 1,
        },
        {
          column_name: "role_id",
          data_type: "bigint",
          is_nullable: "NO",
          column_default: null,
          ordinal_position: 2,
        },
      ]);
      // composite primary key
      executor.mockResolvedValueOnce([{ column_name: "user_id" }, { column_name: "role_id" }]);
      // indexes
      executor.mockResolvedValueOnce([]);

      const schema = await readTableSchema(executor, "user_roles");
      expect(schema.columns[0]!.isPrimary).toBe(true);
      expect(schema.columns[1]!.isPrimary).toBe(true);
    });

    test("rejects invalid table names (SQL injection prevention)", async () => {
      const { executor } = createMockExecutor();
      await expect(readTableSchema(executor, "users; DROP TABLE users")).rejects.toThrow(
        "Invalid table name",
      );
      await expect(readTableSchema(executor, "")).rejects.toThrow("Invalid table name");
      await expect(readTableSchema(executor, "123invalid")).rejects.toThrow("Invalid table name");
      await expect(readTableSchema(executor, "table with spaces")).rejects.toThrow(
        "Invalid table name",
      );
      await expect(readTableSchema(executor, "table'; DROP TABLE users;--")).rejects.toThrow(
        "Invalid table name",
      );
      // valid names should not throw (they will fail on query, but validation passes)
    });

    test("accepts valid table names", async () => {
      const { executor } = createMockExecutor();
      // columns
      executor.mockResolvedValueOnce([]);
      // pk
      executor.mockResolvedValueOnce([]);
      // indexes
      executor.mockResolvedValueOnce([]);

      // Should not throw for valid names
      const schema = await readTableSchema(executor, "users");
      expect(schema.tableName).toBe("users");
    });

    test("accepts table names starting with underscore", async () => {
      const { executor } = createMockExecutor();
      executor.mockResolvedValueOnce([]);
      executor.mockResolvedValueOnce([]);
      executor.mockResolvedValueOnce([]);

      const schema = await readTableSchema(executor, "_migrations");
      expect(schema.tableName).toBe("_migrations");
    });

    test("handles missing indexes gracefully", async () => {
      const { executor } = createMockExecutor();
      // columns
      executor.mockResolvedValueOnce([
        {
          column_name: "id",
          data_type: "bigint",
          is_nullable: "NO",
          column_default: null,
          ordinal_position: 1,
        },
      ]);
      // pk
      executor.mockResolvedValueOnce([{ column_name: "id" }]);
      // index query throws (simulating non-PG database)
      executor.mockRejectedValueOnce(new Error("pg_class not found"));

      const schema = await readTableSchema(executor, "simple_table");
      expect(schema.columns).toHaveLength(1);
      expect(schema.indexes).toEqual([]);
    });

    test("groups index columns correctly", async () => {
      const { executor } = createMockExecutor();
      // columns
      executor.mockResolvedValueOnce([
        {
          column_name: "id",
          data_type: "bigint",
          is_nullable: "NO",
          column_default: null,
          ordinal_position: 1,
        },
        {
          column_name: "a",
          data_type: "integer",
          is_nullable: "NO",
          column_default: null,
          ordinal_position: 2,
        },
        {
          column_name: "b",
          data_type: "integer",
          is_nullable: "NO",
          column_default: null,
          ordinal_position: 3,
        },
      ]);
      // pk
      executor.mockResolvedValueOnce([{ column_name: "id" }]);
      // composite index
      executor.mockResolvedValueOnce([
        { index_name: "idx_ab", column_name: "a", is_unique: false },
        { index_name: "idx_ab", column_name: "b", is_unique: false },
        { index_name: "idx_unique_a", column_name: "a", is_unique: true },
      ]);

      const schema = await readTableSchema(executor, "test_table");
      expect(schema.indexes).toHaveLength(2);
      const compositeIdx = schema.indexes.find((i) => i.name === "idx_ab");
      expect(compositeIdx).toBeDefined();
      expect(compositeIdx!.columns).toEqual(["a", "b"]);
      expect(compositeIdx!.unique).toBe(false);

      const uniqueIdx = schema.indexes.find((i) => i.name === "idx_unique_a");
      expect(uniqueIdx).toBeDefined();
      expect(uniqueIdx!.columns).toEqual(["a"]);
      expect(uniqueIdx!.unique).toBe(true);
    });

    test("returns empty columns when table has none", async () => {
      const { executor } = createMockExecutor();
      executor.mockResolvedValueOnce([]);
      executor.mockResolvedValueOnce([]);
      executor.mockResolvedValueOnce([]);

      const schema = await readTableSchema(executor, "empty_table");
      expect(schema.columns).toEqual([]);
      expect(schema.indexes).toEqual([]);
    });

    test("uses parameterized queries for table name", async () => {
      const executor = mock(async (_text: string, _params?: unknown[]): Promise<unknown[]> => []);
      executor.mockResolvedValueOnce([]);
      executor.mockResolvedValueOnce([]);
      executor.mockResolvedValueOnce([]);

      await readTableSchema(executor, "my_table");
      // 验证使用参数化查询（$1 占位符 + params 数组）
      expect(executor.mock.calls[0]![0]).toContain("$1");
      expect(executor.mock.calls[0]![1]).toEqual(["my_table"]);
      expect(executor.mock.calls[0]![0]).toContain("information_schema.columns");
      expect(executor.mock.calls[1]![0]).toContain("$1");
      expect(executor.mock.calls[1]![1]).toEqual(["my_table"]);
      expect(executor.mock.calls[1]![0]).toContain("PRIMARY KEY");
      expect(executor.mock.calls[2]![0]).toContain("$1");
      expect(executor.mock.calls[2]![1]).toEqual(["my_table"]);
    });
  });
});

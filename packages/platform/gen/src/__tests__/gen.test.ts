/**
 * @ventostack/gen - 代码生成服务测试
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { createGenService } from "../services/gen";
import { createMockDatabase, createMockExecutor, createMockReadTableSchema } from "./helpers";

describe("GenService", () => {
  let executor: ReturnType<typeof createMockExecutor>["executor"];
  let calls: ReturnType<typeof createMockExecutor>["calls"];
  let results: ReturnType<typeof createMockExecutor>["results"];
  let readTableSchema: ReturnType<typeof createMockReadTableSchema>;
  let service: ReturnType<typeof createGenService>;
  let db: ReturnType<typeof createMockDatabase>["db"];

  beforeEach(() => {
    const mockExec = createMockExecutor();
    executor = mockExec.executor;
    calls = mockExec.calls;
    results = mockExec.results;
    readTableSchema = createMockReadTableSchema();
    const mockDb = createMockDatabase(mockExec);
    db = mockDb.db;
    service = createGenService({ db, executor, readTableSchema });
  });

  describe("importTable", () => {
    it("should import a table with columns", async () => {
      const { tableId } = await service.importTable("sys_user", "system", "admin");

      expect(tableId).toBeTruthy();
      // Should call readTableSchema
      expect(readTableSchema).toHaveBeenCalledWith(executor, "sys_user");
      // Should insert table + 5 columns = 6 executor calls
      expect(calls.length).toBe(6);
      // First call is INSERT INTO sys_gen_table
      expect(calls[0]!.text).toContain("INSERT INTO sys_gen_table");
      // Remaining are INSERT INTO sys_gen_table_column
      for (let i = 1; i <= 5; i++) {
        expect(calls[i]!.text).toContain("INSERT INTO sys_gen_table_column");
      }
    });

    it("should use author when provided", async () => {
      await service.importTable("sys_role", "system", "zhangsan");

      expect(calls[0]!.params).toContain("zhangsan");
    });

    it("should use null author when not provided", async () => {
      await service.importTable("sys_role", "system");

      expect(calls[0]!.params).toContain(null);
    });

    it("should derive className from tableName", async () => {
      await service.importTable("sys_user_profile", "system");

      // PascalCase of "user_profile" = "UserProfile"
      expect(calls[0]!.params).toContain("UserProfile");
      // functionName = "UserProfile管理"
      expect(calls[0]!.params).toContain("UserProfile管理");
    });

    it("should strip sys_ prefix for className", async () => {
      await service.importTable("sys_order", "order");

      expect(calls[0]!.params).toContain("Order");
    });
  });

  describe("updateTable", () => {
    it("should update table fields", async () => {
      await service.updateTable("table-1", { className: "UserNew", remark: "用户表" });

      expect(calls.length).toBe(1);
      expect(calls[0]!.text).toContain("UPDATE sys_gen_table SET");
      expect(calls[0]!.text).toContain("class_name");
      expect(calls[0]!.text).toContain("remark");
    });

    it("should skip update when no fields provided", async () => {
      await service.updateTable("table-1", {});

      expect(calls.length).toBe(0);
    });

    it("should update multiple fields", async () => {
      await service.updateTable("table-1", {
        className: "User",
        moduleName: "user",
        functionName: "用户管理",
        functionAuthor: "admin",
        remark: "test",
      });

      expect(calls.length).toBe(1);
      const text = calls[0]!.text;
      expect(text).toContain("class_name");
      expect(text).toContain("module_name");
      expect(text).toContain("function_name");
      expect(text).toContain("function_author");
      expect(text).toContain("remark");
    });
  });

  describe("updateColumn", () => {
    it("should update column fields", async () => {
      await service.updateColumn("col-1", { isQuery: true, queryType: "LIKE" });

      expect(calls.length).toBe(1);
      expect(calls[0]!.text).toContain("UPDATE sys_gen_table_column SET");
      expect(calls[0]!.text).toContain("is_query");
      expect(calls[0]!.text).toContain("query_type");
    });

    it("should skip update when no fields provided", async () => {
      await service.updateColumn("col-1", {});

      expect(calls.length).toBe(0);
    });
  });

  describe("getTable", () => {
    it("should return null when table not found", async () => {
      results.set("SELECT * FROM sys_gen_table WHERE id", []);

      const table = await service.getTable("nonexistent");
      expect(table).toBeNull();
    });

    it("should return table info", async () => {
      results.set("SELECT * FROM sys_gen_table WHERE id", [
        {
          id: "t1",
          table_name: "sys_user",
          class_name: "User",
          module_name: "system",
          function_name: "用户管理",
          function_author: "admin",
          remark: null,
          status: 0,
        },
      ]);

      const table = await service.getTable("t1");
      expect(table).not.toBeNull();
      expect(table!.id).toBe("t1");
      expect(table!.tableName).toBe("sys_user");
      expect(table!.className).toBe("User");
    });
  });

  describe("listTables", () => {
    it("should list tables with pagination", async () => {
      results.set("SELECT COUNT(*)", [{ total: 2 }]);
      results.set("SELECT * FROM sys_gen_table ORDER BY", [
        {
          id: "t1",
          table_name: "sys_user",
          class_name: "User",
          module_name: "system",
          function_name: "用户管理",
          function_author: null,
          remark: null,
          status: 0,
        },
        {
          id: "t2",
          table_name: "sys_role",
          class_name: "Role",
          module_name: "system",
          function_name: "角色管理",
          function_author: null,
          remark: null,
          status: 0,
        },
      ]);

      const result = await service.listTables({ page: 1, pageSize: 10 });
      expect(result.total).toBe(2);
      expect(result.items.length).toBe(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.totalPages).toBe(1);
    });

    it("should use default pagination", async () => {
      results.set("SELECT COUNT(*)", [{ total: 0 }]);

      const result = await service.listTables();
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
    });
  });

  describe("getColumns", () => {
    it("should return columns for a table", async () => {
      results.set("SELECT * FROM sys_gen_table_column WHERE table_id", [
        {
          id: "c1",
          table_id: "t1",
          column_name: "id",
          column_type: "VARCHAR(36)",
          typescript_type: "string",
          field_name: "id",
          field_comment: null,
          is_primary: true,
          is_nullable: false,
          is_list: false,
          is_insert: false,
          is_update: false,
          is_query: false,
          query_type: null,
          sort: 0,
        },
        {
          id: "c2",
          table_id: "t1",
          column_name: "name",
          column_type: "VARCHAR(128)",
          typescript_type: "string",
          field_name: "name",
          field_comment: "名称",
          is_primary: false,
          is_nullable: false,
          is_list: true,
          is_insert: true,
          is_update: true,
          is_query: false,
          query_type: null,
          sort: 1,
        },
      ]);

      const columns = await service.getColumns("t1");
      expect(columns.length).toBe(2);
      expect(columns[0]!.isPrimary).toBe(true);
      expect(columns[1]!.isList).toBe(true);
    });
  });

  describe("preview / generate", () => {
    it("should throw when table not found", async () => {
      results.set("SELECT * FROM sys_gen_table WHERE id", []);

      await expect(service.preview("nonexistent")).rejects.toThrow("表不存在");
    });

    it("should generate 5 files", async () => {
      results.set("SELECT * FROM sys_gen_table WHERE id", [
        {
          id: "t1",
          table_name: "sys_user",
          class_name: "User",
          module_name: "system",
          function_name: "用户管理",
          function_author: "admin",
          remark: null,
          status: 0,
        },
      ]);
      results.set("SELECT * FROM sys_gen_table_column WHERE table_id", [
        {
          id: "c1",
          table_id: "t1",
          column_name: "id",
          column_type: "VARCHAR(36)",
          typescript_type: "string",
          field_name: "id",
          field_comment: "主键",
          is_primary: true,
          is_nullable: false,
          is_list: false,
          is_insert: false,
          is_update: false,
          is_query: false,
          query_type: null,
          sort: 0,
        },
        {
          id: "c2",
          table_id: "t1",
          column_name: "name",
          column_type: "VARCHAR(128)",
          typescript_type: "string",
          field_name: "name",
          field_comment: "名称",
          is_primary: false,
          is_nullable: false,
          is_list: true,
          is_insert: true,
          is_update: true,
          is_query: false,
          query_type: null,
          sort: 1,
        },
      ]);

      const files = await service.preview("t1");
      expect(files.length).toBe(5);

      const filenames = files.map((f) => f.filename);
      expect(filenames).toContain("models/user.ts");
      expect(filenames).toContain("services/user.ts");
      expect(filenames).toContain("routes/user.ts");
      expect(filenames).toContain("types/user.ts");
      expect(filenames).toContain("__tests__/user.test.ts");

      // Each file should have content
      for (const file of files) {
        expect(file.content.length).toBeGreaterThan(0);
      }
    });

    it("generate should produce same result as preview", async () => {
      results.set("SELECT * FROM sys_gen_table WHERE id", [
        {
          id: "t1",
          table_name: "sys_role",
          class_name: "Role",
          module_name: "system",
          function_name: "角色管理",
          function_author: null,
          remark: null,
          status: 0,
        },
      ]);
      results.set("SELECT * FROM sys_gen_table_column WHERE table_id", [
        {
          id: "c1",
          table_id: "t1",
          column_name: "id",
          column_type: "VARCHAR(36)",
          typescript_type: "string",
          field_name: "id",
          field_comment: null,
          is_primary: true,
          is_nullable: false,
          is_list: false,
          is_insert: false,
          is_update: false,
          is_query: false,
          query_type: null,
          sort: 0,
        },
      ]);

      const preview = await service.preview("t1");
      // Reset calls for clean comparison
      calls.length = 0;
      const generated = await service.generate("t1");

      expect(generated.length).toBe(preview.length);
      for (let i = 0; i < generated.length; i++) {
        expect(generated[i]!.filename).toBe(preview[i]!.filename);
        expect(generated[i]!.content).toBe(preview[i]!.content);
      }
    });
  });

  describe("template rendering", () => {
    it("model template should produce defineModel code", async () => {
      results.set("SELECT * FROM sys_gen_table WHERE id", [
        {
          id: "t1",
          table_name: "sys_user",
          class_name: "User",
          module_name: "system",
          function_name: "用户管理",
          function_author: null,
          remark: null,
          status: 0,
        },
      ]);
      results.set("SELECT * FROM sys_gen_table_column WHERE table_id", [
        {
          id: "c1",
          table_id: "t1",
          column_name: "id",
          column_type: "VARCHAR(36)",
          typescript_type: "string",
          field_name: "id",
          field_comment: null,
          is_primary: true,
          is_nullable: false,
          is_list: false,
          is_insert: false,
          is_update: false,
          is_query: false,
          query_type: null,
          sort: 0,
        },
        {
          id: "c2",
          table_id: "t1",
          column_name: "name",
          column_type: "VARCHAR(128)",
          typescript_type: "string",
          field_name: "name",
          field_comment: null,
          is_primary: false,
          is_nullable: false,
          is_list: true,
          is_insert: true,
          is_update: true,
          is_query: false,
          query_type: null,
          sort: 1,
        },
      ]);

      const files = await service.preview("t1");
      const modelFile = files.find((f) => f.filename.includes("model"))!;
      expect(modelFile.content).toContain("defineModel('sys_user'");
      expect(modelFile.content).toContain("id: column.string({ primary: true })");
      expect(modelFile.content).toContain("name: column.string()");
    });

    it("routes template should produce CRUD routes", async () => {
      results.set("SELECT * FROM sys_gen_table WHERE id", [
        {
          id: "t1",
          table_name: "sys_user",
          class_name: "User",
          module_name: "system",
          function_name: "用户管理",
          function_author: null,
          remark: null,
          status: 0,
        },
      ]);
      results.set("SELECT * FROM sys_gen_table_column WHERE table_id", [
        {
          id: "c1",
          table_id: "t1",
          column_name: "id",
          column_type: "VARCHAR(36)",
          typescript_type: "string",
          field_name: "id",
          field_comment: null,
          is_primary: true,
          is_nullable: false,
          is_list: false,
          is_insert: false,
          is_update: false,
          is_query: false,
          query_type: null,
          sort: 0,
        },
      ]);

      const files = await service.preview("t1");
      const routesFile = files.find((f) => f.filename.includes("routes"))!;
      expect(routesFile.content).toContain("createUserRoutes");
      expect(routesFile.content).toContain("router.get(");
      expect(routesFile.content).toContain("router.post(");
      expect(routesFile.content).toContain("router.put(");
      expect(routesFile.content).toContain("router.delete(");
    });

    it("types template should produce interfaces", async () => {
      results.set("SELECT * FROM sys_gen_table WHERE id", [
        {
          id: "t1",
          table_name: "sys_user",
          class_name: "User",
          module_name: "system",
          function_name: "用户管理",
          function_author: null,
          remark: null,
          status: 0,
        },
      ]);
      results.set("SELECT * FROM sys_gen_table_column WHERE table_id", [
        {
          id: "c1",
          table_id: "t1",
          column_name: "id",
          column_type: "VARCHAR(36)",
          typescript_type: "string",
          field_name: "id",
          field_comment: null,
          is_primary: true,
          is_nullable: false,
          is_list: false,
          is_insert: false,
          is_update: false,
          is_query: false,
          query_type: null,
          sort: 0,
        },
        {
          id: "c2",
          table_id: "t1",
          column_name: "name",
          column_type: "VARCHAR(128)",
          typescript_type: "string",
          field_name: "name",
          field_comment: null,
          is_primary: false,
          is_nullable: true,
          is_list: true,
          is_insert: true,
          is_update: true,
          is_query: false,
          query_type: null,
          sort: 1,
        },
      ]);

      const files = await service.preview("t1");
      const typesFile = files.find((f) => f.filename.includes("types"))!;
      expect(typesFile.content).toContain("CreateUserParams");
      expect(typesFile.content).toContain("UpdateUserParams");
      expect(typesFile.content).toContain("UserListParams");
      expect(typesFile.content).toContain("id: unknown");
      expect(typesFile.content).toContain("name?: unknown"); // nullable
    });
  });
});

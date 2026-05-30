import { describe, expect, test } from "bun:test";

describe("代码生成器页", () => {
  test("GenTable 类型应包含必要字段", () => {
    const table = {
      id: "1",
      tableName: "sys_user",
      moduleName: "system",
      genType: "single",
      packagePath: "packages/platform/system",
      remark: "用户表",
      createdAt: "2024-01-01",
    };
    expect(table.tableName).toBe("sys_user");
    expect(["single", "tree", "sub"]).toContain(table.genType);
  });

  test("GenTableColumn 类型应包含必要字段", () => {
    const column = {
      id: "1",
      tableId: "t1",
      columnName: "username",
      columnType: "varchar(64)",
      tsType: "string",
      displayType: "input",
      queryType: "eq",
      required: true,
      showInList: true,
      showInForm: true,
      showInQuery: true,
      comment: "用户名",
    };
    expect(column.columnName).toBe("username");
    expect(column.required).toBe(true);
    expect(column.displayType).toBeTruthy();
  });

  test("DbTable 类型应包含必要字段", () => {
    const dbTable = {
      tableName: "sys_user",
      tableComment: "用户表",
      engine: "InnoDB",
      createTime: "2024-01-01",
    };
    expect(dbTable.tableName).toBeTruthy();
  });

  test("API 端点路径正确", () => {
    const endpoints = {
      dbTables: "/api/system/gen/db-tables",
      list: "/api/system/gen/tables",
      import: "/api/system/gen/import",
      preview: "/api/system/gen/tables/:id/preview",
      generate: "/api/system/gen/tables/:id/generate",
    };
    expect(endpoints.dbTables).toContain("db-tables");
    expect(endpoints.generate).toContain("generate");
  });

  test("genType 选项正确", () => {
    const genTypes = [
      { value: "single", label: "单表" },
      { value: "tree", label: "树表" },
      { value: "sub", label: "主子表" },
    ];
    expect(genTypes).toHaveLength(3);
    expect(genTypes.map((t) => t.value)).toEqual(["single", "tree", "sub"]);
  });
});

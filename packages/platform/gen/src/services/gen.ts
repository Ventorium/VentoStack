/**
 * @ventostack/gen - 代码生成服务
 *
 * 导入数据库表结构、管理字段配置、生成代码。
 */

import type { Database, SqlExecutor, TableSchemaInfo } from "@ventostack/database";
import { GenTableModel, GenTableColumnModel } from "../models";
import { renderModel } from "../templates/model.ts.tmpl";
import { renderService } from "../templates/service.ts.tmpl";
import { renderRoutes } from "../templates/routes.ts.tmpl";
import { renderTypes } from "../templates/types.ts.tmpl";
import { renderTest } from "../templates/test.ts.tmpl";

/** 导入的表信息 */
export interface GenTableInfo {
  id: string;
  tableName: string;
  className: string;
  moduleName: string;
  functionName: string;
  functionAuthor: string | null;
  remark: string | null;
  status: number;
}

/** 导入的列信息 */
export interface GenColumnInfo {
  id: string;
  tableId: string;
  columnName: string;
  columnType: string;
  typescriptType: string;
  fieldName: string;
  fieldComment: string | null;
  isPrimary: boolean;
  isNullable: boolean;
  isList: boolean;
  isInsert: boolean;
  isUpdate: boolean;
  isQuery: boolean;
  queryType: string | null;
  sort: number;
}

/** 生成的文件 */
export interface GeneratedFile {
  filename: string;
  content: string;
}

/** 分页结果 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 代码生成服务接口 */
export interface GenService {
  importTable(tableName: string, moduleName: string, author?: string): Promise<{ tableId: string }>;
  updateTable(id: string, params: Partial<Pick<GenTableInfo, "className" | "moduleName" | "functionName" | "functionAuthor" | "remark">>): Promise<void>;
  updateColumn(id: string, params: Partial<Pick<GenColumnInfo, "isList" | "isInsert" | "isUpdate" | "isQuery" | "queryType" | "fieldComment">>): Promise<void>;
  getTable(id: string): Promise<GenTableInfo | null>;
  listTables(params?: { page?: number; pageSize?: number }): Promise<PaginatedResult<GenTableInfo>>;
  getColumns(tableId: string): Promise<GenColumnInfo[]>;
  preview(tableId: string): Promise<GeneratedFile[]>;
  generate(tableId: string): Promise<GeneratedFile[]>;
}

/** SQL type → TypeScript type mapping */
function sqlTypeToTs(sqlType: string): string {
  const t = sqlType.toLowerCase();
  if (t.includes("varchar") || t.includes("text") || t.includes("char")) return "string";
  if (t.includes("int") || t.includes("serial") || t.includes("float") || t.includes("double") || t.includes("numeric") || t.includes("decimal") || t.includes("bigint") || t.includes("smallint")) return "number";
  if (t.includes("bool")) return "boolean";
  if (t.includes("timestamp") || t.includes("date") || t.includes("time")) return "string";
  if (t.includes("json") || t.includes("jsonb")) return "Record<string, unknown>";
  return "unknown";
}

/** column_name → fieldName (snake_case → camelCase) */
function toCamelCase(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/** table_name → ClassName (snake_case → PascalCase) */
function toPascalCase(s: string): string {
  return s
    .split("_")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

export function createGenService(deps: {
  db: Database;
  /** readTableSchema from @ventostack/database — needs raw SqlExecutor */
  executor: SqlExecutor;
  readTableSchema: (executor: SqlExecutor, tableName: string) => Promise<TableSchemaInfo>;
}): GenService {
  const { db, executor, readTableSchema } = deps;

  return {
    async importTable(tableName, moduleName, author) {
      const tableId = crypto.randomUUID();

      // Read schema from DB — needs raw executor
      const schema = await readTableSchema(executor, tableName);
      const className = toPascalCase(tableName.replace(/^sys_/, ""));

      await db.query(GenTableModel).insert({
        id: tableId,
        table_name: tableName,
        class_name: className,
        module_name: moduleName,
        function_name: className + "管理",
        function_author: author ?? null,
        status: 0,
      });

      // Insert column records
      for (let i = 0; i < schema.columns.length; i++) {
        const col = schema.columns[i]!;
        const tsType = sqlTypeToTs(col.type);
        await db.query(GenTableColumnModel).insert({
          id: crypto.randomUUID(),
          table_id: tableId,
          column_name: col.name,
          column_type: col.type,
          typescript_type: tsType,
          field_name: toCamelCase(col.name),
          field_comment: col.comment ?? null,
          is_primary: col.isPrimary,
          is_nullable: col.nullable,
          is_list: !col.isPrimary,
          is_insert: !col.isPrimary,
          is_update: !col.isPrimary,
          is_query: false,
          sort: i,
        });
      }

      return { tableId };
    },

    async updateTable(id, params) {
      const updates: Record<string, unknown> = {};
      if (params.className !== undefined) updates.class_name = params.className;
      if (params.moduleName !== undefined) updates.module_name = params.moduleName;
      if (params.functionName !== undefined) updates.function_name = params.functionName;
      if (params.functionAuthor !== undefined) updates.function_author = params.functionAuthor;
      if (params.remark !== undefined) updates.remark = params.remark;

      if (Object.keys(updates).length === 0) return;
      await db.query(GenTableModel).where("id", "=", id).update(updates);
    },

    async updateColumn(id, params) {
      const updates: Record<string, unknown> = {};
      if (params.isList !== undefined) updates.is_list = params.isList;
      if (params.isInsert !== undefined) updates.is_insert = params.isInsert;
      if (params.isUpdate !== undefined) updates.is_update = params.isUpdate;
      if (params.isQuery !== undefined) updates.is_query = params.isQuery;
      if (params.queryType !== undefined) updates.query_type = params.queryType;
      if (params.fieldComment !== undefined) updates.field_comment = params.fieldComment;

      if (Object.keys(updates).length === 0) return;
      await db.query(GenTableColumnModel).where("id", "=", id).update(updates);
    },

    async getTable(id) {
      const row = await db.query(GenTableModel)
        .where("id", "=", id)
        .select("id", "table_name", "class_name", "module_name", "function_name", "function_author", "remark", "status")
        .get();
      if (!row) return null;
      return {
        id: row.id,
        tableName: row.table_name,
        className: row.class_name,
        moduleName: row.module_name,
        functionName: row.function_name,
        functionAuthor: row.function_author ?? null,
        remark: row.remark ?? null,
        status: row.status,
      };
    },

    async listTables(params) {
      const { page = 1, pageSize = 10 } = params ?? {};

      const total = await db.query(GenTableModel).count();

      const rows = await db.query(GenTableModel)
        .select("id", "table_name", "class_name", "module_name", "function_name", "function_author", "remark", "status")
        .orderBy("created_at", "desc")
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .list();

      const items = rows.map((row) => ({
        id: row.id,
        tableName: row.table_name,
        className: row.class_name,
        moduleName: row.module_name,
        functionName: row.function_name,
        functionAuthor: row.function_author ?? null,
        remark: row.remark ?? null,
        status: row.status,
      }));

      return { items, total, page, pageSize, totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0 };
    },

    async getColumns(tableId) {
      const rows = await db.query(GenTableColumnModel)
        .where("table_id", "=", tableId)
        .select("id", "table_id", "column_name", "column_type", "typescript_type", "field_name", "field_comment", "is_primary", "is_nullable", "is_list", "is_insert", "is_update", "is_query", "query_type", "sort")
        .orderBy("sort", "asc")
        .list();

      return rows.map((row) => ({
        id: row.id,
        tableId: row.table_id,
        columnName: row.column_name,
        columnType: row.column_type,
        typescriptType: row.typescript_type,
        fieldName: row.field_name,
        fieldComment: row.field_comment ?? null,
        isPrimary: row.is_primary,
        isNullable: row.is_nullable,
        isList: row.is_list,
        isInsert: row.is_insert,
        isUpdate: row.is_update,
        isQuery: row.is_query,
        queryType: row.query_type ?? null,
        sort: row.sort,
      }));
    },

    async preview(tableId) {
      const table = await this.getTable(tableId);
      if (!table) throw new Error("表不存在");
      const columns = await this.getColumns(tableId);

      return [
        { filename: `models/${toKebab(table.className)}.ts`, content: renderModel(table, columns) },
        { filename: `services/${toKebab(table.className)}.ts`, content: renderService(table, columns) },
        { filename: `routes/${toKebab(table.className)}.ts`, content: renderRoutes(table, columns) },
        { filename: `types/${toKebab(table.className)}.ts`, content: renderTypes(table, columns) },
        { filename: `__tests__/${toKebab(table.className)}.test.ts`, content: renderTest(table, columns) },
      ];
    },

    async generate(tableId) {
      return this.preview(tableId);
    },
  };
}

function toKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

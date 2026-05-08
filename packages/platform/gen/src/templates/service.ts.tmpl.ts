/**
 * Service 代码模板 — 使用 ORM Query Builder
 */

import type { GenTableInfo, GenColumnInfo } from "../services/gen";

export function renderService(table: GenTableInfo, columns: GenColumnInfo[]): string {
  const nonPrimaryCols = columns.filter(c => !c.isPrimary);
  const insertableCols = nonPrimaryCols.filter(c => c.isInsert);
  const updatableCols = nonPrimaryCols.filter(c => c.isUpdate);
  const queryableCols = columns.filter(c => c.isQuery);

  const createParams = insertableCols.map(c =>
    `  ${c.fieldName}${c.isNullable ? "?" : ""}: ${mapTsType(c.typescriptType)};`
  ).join("\n");

  const updateParams = updatableCols.map(c =>
    `  ${c.fieldName}?: ${mapTsType(c.typescriptType)};`
  ).join("\n");

  const listParams = queryableCols.map(c =>
    `  ${c.fieldName}?: ${mapTsType(c.typescriptType)};`
  ).join("\n");

  const modelFields = columns.map(c =>
    `  ${c.columnName}: column.${mapColumnType(c.typescriptType)}({${c.isPrimary ? " primary: true," : ""}${c.isNullable ? " nullable: true," : ""}}),`
  ).join("\n");

  return `import { defineModel, column } from "@ventostack/database";
import type { Database } from "@ventostack/database";

const ${table.className}Model = defineModel('${table.tableName}', {
${modelFields}
}, { softDelete: true, timestamps: true });

export interface Create${table.className}Params {
${createParams}
}

export interface Update${table.className}Params {
${updateParams}
}

export interface ${table.className}ListItem {
${columns.map(c => `  ${c.fieldName}: ${mapTsType(c.typescriptType)}${c.isNullable ? " | null" : ""};`).join("\n")}
}

export interface ${table.className}ListParams {
  page?: number;
  pageSize?: number;
${listParams}
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ${table.className}Service {
  create(params: Create${table.className}Params): Promise<{ id: string }>;
  update(id: string, params: Update${table.className}Params): Promise<void>;
  delete(id: string): Promise<void>;
  getById(id: string): Promise<${table.className}ListItem | null>;
  list(params: ${table.className}ListParams): Promise<PaginatedResult<${table.className}ListItem>>;
}

export function create${table.className}Service(deps: { db: Database }): ${table.className}Service {
  const { db } = deps;

  return {
    async create(params) {
      const id = crypto.randomUUID();
      await db.query(${table.className}Model).insert({
        id,
${insertableCols.map(c => `        ${c.fieldName}: params.${c.fieldName}${c.isNullable ? " ?? null" : ""},`).join("\n")}
      });
      return { id };
    },

    async update(id, params) {
      const data: Record<string, unknown> = {};
${updatableCols.map(c => `      if (params.${c.fieldName} !== undefined) data.${c.columnName} = params.${c.fieldName};`).join("\n")}
      if (Object.keys(data).length === 0) return;
      await db.query(${table.className}Model).where("id", "=", id).update(data);
    },

    async delete(id) {
      await db.query(${table.className}Model).where("id", "=", id).delete();
    },

    async getById(id) {
      return db.query(${table.className}Model)
        .where("id", "=", id)
        .get() as Promise<${table.className}ListItem | null>;
    },

    async list(params) {
      const { page = 1, pageSize = 10${queryableCols.length > 0 ? ", " + queryableCols.map(c => c.fieldName).join(", ") : ""} } = params;

      let query = db.query(${table.className}Model);
${queryableCols.map(c => `      if (${c.fieldName} !== undefined) query = query.where("${c.columnName}", "=", ${c.fieldName});`).join("\n")}

      const total = await query.count();
      const items = await query
        .orderBy("created_at", "desc")
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .list() as ${table.className}ListItem[];

      return {
        items,
        total,
        page,
        pageSize,
        totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
      };
    },
  };
}
`;
}

function mapTsType(pgType: string): string {
  const map: Record<string, string> = {
    varchar: "string", text: "string", char: "string",
    int: "number", integer: "number", smallint: "number", bigint: "number", serial: "number",
    boolean: "bool", bool: "boolean",
    timestamp: "Date", timestamptz: "Date", date: "Date",
    json: "Record<string, unknown>", jsonb: "Record<string, unknown>",
    float: "number", double: "number", numeric: "number", decimal: "number",
  };
  return map[pgType.toLowerCase()] ?? "unknown";
}

function mapColumnType(pgType: string): string {
  const map: Record<string, string> = {
    varchar: "varchar", text: "text", char: "char",
    int: "int", integer: "int", smallint: "int", bigint: "bigint", serial: "int",
    boolean: "boolean", bool: "boolean",
    timestamp: "timestamp", timestamptz: "timestamp", date: "timestamp",
    json: "json", jsonb: "json",
    float: "float", double: "double", numeric: "numeric", decimal: "decimal",
  };
  return map[pgType.toLowerCase()] ?? "varchar";
}

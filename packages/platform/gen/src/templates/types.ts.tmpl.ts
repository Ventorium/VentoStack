/**
 * Types 代码模板
 */

import type { GenColumnInfo, GenTableInfo } from "../services/gen";

export function renderTypes(table: GenTableInfo, columns: GenColumnInfo[]): string {
  const fields = columns
    .map(
      (c) =>
        `  ${c.fieldName}${c.isNullable ? "?" : ""}: ${mapTsType(c.typescriptType)}${c.isNullable ? " | null" : ""};`,
    )
    .join("\n");

  return `/** ${table.functionName} - 由代码生成器生成 */

export interface ${table.className} {
${fields}
}

export interface Create${table.className}Params {
${columns
  .filter((c) => !c.isPrimary && c.isInsert)
  .map((c) => `  ${c.fieldName}${c.isNullable ? "?" : ""}: ${mapTsType(c.typescriptType)};`)
  .join("\n")}
}

export interface Update${table.className}Params {
${columns
  .filter((c) => !c.isPrimary && c.isUpdate)
  .map((c) => `  ${c.fieldName}?: ${mapTsType(c.typescriptType)};`)
  .join("\n")}
}

export interface ${table.className}ListParams {
  page?: number;
  pageSize?: number;
${columns
  .filter((c) => c.isQuery)
  .map((c) => `  ${c.fieldName}?: ${mapTsType(c.typescriptType)};`)
  .join("\n")}
}
`;
}

function mapTsType(pgType: string): string {
  const map: Record<string, string> = {
    varchar: "string",
    text: "string",
    char: "string",
    int: "number",
    integer: "number",
    smallint: "number",
    bigint: "number",
    serial: "number",
    boolean: "boolean",
    bool: "boolean",
    timestamp: "string",
    timestamptz: "string",
    date: "string",
    json: "Record<string, unknown>",
    jsonb: "Record<string, unknown>",
    float: "number",
    double: "number",
    numeric: "number",
    decimal: "number",
  };
  return map[pgType.toLowerCase()] ?? "unknown";
}

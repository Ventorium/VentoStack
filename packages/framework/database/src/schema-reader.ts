/**
 * @ventostack/database — Schema Reader
 * 读取数据库表结构信息（列、索引、主键等）
 * 基于 PostgreSQL information_schema 和系统目录查询
 */

import type { SqlExecutor } from "./database";

/** 列结构信息 */
export interface ColumnSchemaInfo {
  /** 列名 */
  name: string;
  /** 数据类型 */
  type: string;
  /** 是否可空 */
  nullable: boolean;
  /** 默认值 */
  defaultValue: unknown;
  /** 是否为主键 */
  isPrimary: boolean;
  /** 列注释 */
  comment?: string;
}

/** 索引结构信息 */
export interface IndexSchemaInfo {
  /** 索引名称 */
  name: string;
  /** 索引包含的列 */
  columns: string[];
  /** 是否唯一索引 */
  unique: boolean;
}

/** 表结构信息 */
export interface TableSchemaInfo {
  /** 表名 */
  tableName: string;
  /** 列信息 */
  columns: ColumnSchemaInfo[];
  /** 索引信息 */
  indexes: IndexSchemaInfo[];
}

/**
 * 列出数据库中所有用户表
 * @param executor — SQL 执行器
 * @returns 表名列表
 */
export async function listTables(executor: SqlExecutor): Promise<string[]> {
  const rows = (await executor(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
  )) as Array<{ table_name: string }>;
  return rows.map((r) => r.table_name);
}

/**
 * 读取指定表的结构信息（列、主键、索引）
 * @param executor — SQL 执行器
 * @param tableName — 表名（仅允许字母、数字、下划线，且以字母或下划线开头）
 * @returns 表结构信息
 */
export async function readTableSchema(
  executor: SqlExecutor,
  tableName: string,
): Promise<TableSchemaInfo> {
  // 校验表名，防止 SQL 注入
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }

  // 读取列信息
  const columns = (await executor(
    `SELECT column_name, data_type, is_nullable, column_default, ordinal_position
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = '${tableName}'
     ORDER BY ordinal_position`,
  )) as Array<Record<string, unknown>>;

  // 读取主键信息
  const pkRows = (await executor(
    `SELECT kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
     WHERE tc.table_name = '${tableName}' AND tc.constraint_type = 'PRIMARY KEY'`,
  )) as Array<{ column_name: string }>;
  const pkColumns = new Set(pkRows.map((r) => r.column_name));

  // 映射列信息
  const columnInfos: ColumnSchemaInfo[] = columns.map((col) => ({
    name: col.column_name as string,
    type: col.data_type as string,
    nullable: col.is_nullable === "YES",
    defaultValue: col.column_default,
    isPrimary: pkColumns.has(col.column_name as string),
  }));

  // 读取索引信息（PostgreSQL 特有查询，best-effort）
  let indexes: IndexSchemaInfo[] = [];
  try {
    const idxRows = (await executor(
      `SELECT i.relname as index_name, a.attname as column_name, ix.indisunique as is_unique
       FROM pg_class t
       JOIN pg_index ix ON t.oid = ix.indrelid
       JOIN pg_class i ON i.oid = ix.indexrelid
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
       WHERE t.relname = '${tableName}'`,
    )) as Array<{ index_name: string; column_name: string; is_unique: boolean }>;

    const idxMap = new Map<string, { columns: string[]; unique: boolean }>();
    for (const row of idxRows) {
      if (!idxMap.has(row.index_name)) {
        idxMap.set(row.index_name, { columns: [], unique: row.is_unique });
      }
      idxMap.get(row.index_name)!.columns.push(row.column_name);
    }
    indexes = Array.from(idxMap.entries()).map(([name, info]) => ({
      name,
      columns: info.columns,
      unique: info.unique,
    }));
  } catch {
    // 索引读取为 best-effort，非 PostgreSQL 数据库可能失败
    indexes = [];
  }

  return { tableName, columns: columnInfos, indexes };
}

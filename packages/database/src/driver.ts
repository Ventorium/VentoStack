// @aeron/database - 多数据库类型驱动

import type { SqlExecutor } from "./database";

export type DatabaseDriver = "postgresql" | "mysql" | "sqlite" | "mssql";

export interface DriverConfig {
  driver: DatabaseDriver;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  url?: string;
  options?: Record<string, unknown>;
}

export interface DriverAdapter {
  driver: DatabaseDriver;
  /** 拼接 placeholder（pg: $1, mysql: ?, sqlite: ?, mssql: @p1） */
  placeholder(index: number): string;
  /** 标识符引用（pg: "x", mysql: `x`, mssql: [x]） */
  quote(identifier: string): string;
  /** 分页语法 */
  limitOffset(limit: number, offset: number): string;
  /** RETURNING 语法 */
  returning(fields: string[]): string;
  /** 当前时间戳函数 */
  now(): string;
  /** UPSERT 语法 */
  upsert(table: string, fields: string[], conflictFields: string[]): string;
  /** 布尔字面量 */
  boolean(value: boolean): string;
}

function createPostgresAdapter(): DriverAdapter {
  return {
    driver: "postgresql",
    placeholder: (i) => `$${i}`,
    quote: (id) => `"${id}"`,
    limitOffset: (limit, offset) => `LIMIT ${limit} OFFSET ${offset}`,
    returning: (fields) => `RETURNING ${fields.join(", ")}`,
    now: () => "NOW()",
    upsert: (table, fields, conflict) =>
      `INSERT INTO ${table} (${fields.join(", ")}) VALUES (${fields.map((_, i) => `$${i + 1}`).join(", ")}) ON CONFLICT (${conflict.join(", ")}) DO UPDATE SET ${fields.filter((f) => !conflict.includes(f)).map((f) => `${f} = EXCLUDED.${f}`).join(", ")}`,
    boolean: (v) => (v ? "TRUE" : "FALSE"),
  };
}

function createMysqlAdapter(): DriverAdapter {
  return {
    driver: "mysql",
    placeholder: () => "?",
    quote: (id) => `\`${id}\``,
    limitOffset: (limit, offset) => `LIMIT ${limit} OFFSET ${offset}`,
    returning: () => "", // MySQL 不支持 RETURNING
    now: () => "NOW()",
    upsert: (table, fields) =>
      `INSERT INTO ${table} (${fields.join(", ")}) VALUES (${fields.map(() => "?").join(", ")}) ON DUPLICATE KEY UPDATE ${fields.map((f) => `${f} = VALUES(${f})`).join(", ")}`,
    boolean: (v) => (v ? "1" : "0"),
  };
}

function createSqliteAdapter(): DriverAdapter {
  return {
    driver: "sqlite",
    placeholder: () => "?",
    quote: (id) => `"${id}"`,
    limitOffset: (limit, offset) => `LIMIT ${limit} OFFSET ${offset}`,
    returning: (fields) => `RETURNING ${fields.join(", ")}`,
    now: () => "datetime('now')",
    upsert: (table, fields, conflict) =>
      `INSERT INTO ${table} (${fields.join(", ")}) VALUES (${fields.map(() => "?").join(", ")}) ON CONFLICT (${conflict.join(", ")}) DO UPDATE SET ${fields.filter((f) => !conflict.includes(f)).map((f) => `${f} = EXCLUDED.${f}`).join(", ")}`,
    boolean: (v) => (v ? "1" : "0"),
  };
}

function createMssqlAdapter(): DriverAdapter {
  return {
    driver: "mssql",
    placeholder: (i) => `@p${i}`,
    quote: (id) => `[${id}]`,
    limitOffset: (limit, offset) => `OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`,
    returning: (fields) => `OUTPUT ${fields.map((f) => `INSERTED.${f}`).join(", ")}`,
    now: () => "GETDATE()",
    upsert: (table, fields, conflict) =>
      `MERGE ${table} AS target USING (SELECT ${fields.map((_, i) => `@p${i + 1} AS ${fields[i]}`).join(", ")}) AS source ON (${conflict.map((f) => `target.${f} = source.${f}`).join(" AND ")}) WHEN MATCHED THEN UPDATE SET ${fields.filter((f) => !conflict.includes(f)).map((f) => `${f} = source.${f}`).join(", ")} WHEN NOT MATCHED THEN INSERT (${fields.join(", ")}) VALUES (${fields.map((f) => `source.${f}`).join(", ")});`,
    boolean: (v) => (v ? "1" : "0"),
  };
}

/**
 * 根据驱动类型创建适配器
 */
export function createDriverAdapter(driver: DatabaseDriver): DriverAdapter {
  switch (driver) {
    case "postgresql":
      return createPostgresAdapter();
    case "mysql":
      return createMysqlAdapter();
    case "sqlite":
      return createSqliteAdapter();
    case "mssql":
      return createMssqlAdapter();
    default:
      throw new Error(`Unsupported database driver: ${driver}`);
  }
}

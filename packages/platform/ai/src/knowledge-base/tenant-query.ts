/**
 * 租户隔离查询工厂
 * 所有数据访问自动追加 WHERE tenant_id = $tenantId
 * 不暴露 raw() 方法，防止绕过 tenant_id 过滤
 */
import type { Database } from "@ventostack/database";

export interface TenantQuery {
  db: Database;
  tenantId: string;

  /** 自动追加 WHERE tenant_id = tenantId */
  select<T>(table: string, conditions?: Record<string, unknown>): Promise<T[]>;
  /** 查询单条，自动追加 tenant_id */
  selectOne<T>(table: string, conditions?: Record<string, unknown>): Promise<T | null>;
  /** 插入数据，自动注入 tenant_id */
  insert(table: string, data: Record<string, unknown>): Promise<void>;
  /** 更新数据，自动追加 tenant_id 条件 */
  update(table: string, data: Record<string, unknown>, conditions: Record<string, unknown>): Promise<void>;
  /** 删除数据，自动追加 tenant_id 条件 */
  delete(table: string, conditions: Record<string, unknown>): Promise<void>;
  /** 计数，自动追加 tenant_id 条件 */
  count(table: string, conditions?: Record<string, unknown>): Promise<number>;
}

function buildWhereClause(
  conditions: Record<string, unknown>,
  tenantId: string,
  startIdx: number,
): { clause: string; values: unknown[] } {
  const allConditions = { ...conditions, tenant_id: tenantId };
  const entries = Object.entries(allConditions);
  const clauses: string[] = [];
  const values: unknown[] = [];
  let idx = startIdx;

  for (const [key, value] of entries) {
    if (value === null) {
      clauses.push(`${key} IS NULL`);
    } else {
      clauses.push(`${key} = $${idx++}`);
      values.push(value);
    }
  }

  return {
    clause: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

function buildSetClause(
  data: Record<string, unknown>,
  startIdx: number,
): { clause: string; values: unknown[]; nextIdx: number } {
  const entries = Object.entries(data);
  const clauses: string[] = [];
  const values: unknown[] = [];
  let idx = startIdx;

  for (const [key, value] of entries) {
    clauses.push(`${key} = $${idx++}`);
    values.push(value);
  }

  return { clause: clauses.join(", "), values, nextIdx: idx };
}

export function createTenantQuery(db: Database, tenantId: string): TenantQuery {
  async function select<T>(
    table: string,
    conditions: Record<string, unknown> = {},
  ): Promise<T[]> {
    const { clause, values } = buildWhereClause(conditions, tenantId, 1);
    return db.raw(`SELECT * FROM ${table} ${clause}`, values) as Promise<T[]>;
  }

  async function selectOne<T>(
    table: string,
    conditions: Record<string, unknown> = {},
  ): Promise<T | null> {
    const rows = await select<T>(table, conditions);
    return rows.length > 0 ? rows[0] : null;
  }

  async function insert(
    table: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const withTenant = { ...data, tenant_id: tenantId };
    const entries = Object.entries(withTenant);
    const columns = entries.map(([key]) => key).join(", ");
    const placeholders = entries.map((_, i) => `$${i + 1}`).join(", ");
    const values = entries.map(([, value]) => value);

    await db.raw(
      `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`,
      values,
    );
  }

  async function update(
    table: string,
    data: Record<string, unknown>,
    conditions: Record<string, unknown>,
  ): Promise<void> {
    const { clause: setClause, values: setValues, nextIdx } = buildSetClause(data, 1);
    const { clause: whereClause, values: whereValues } = buildWhereClause(
      conditions,
      tenantId,
      nextIdx,
    );

    await db.raw(
      `UPDATE ${table} SET ${setClause} ${whereClause}`,
      [...setValues, ...whereValues],
    );
  }

  async function del(
    table: string,
    conditions: Record<string, unknown>,
  ): Promise<void> {
    const { clause, values } = buildWhereClause(conditions, tenantId, 1);
    await db.raw(`DELETE FROM ${table} ${clause}`, values);
  }

  async function count(
    table: string,
    conditions: Record<string, unknown> = {},
  ): Promise<number> {
    const { clause, values } = buildWhereClause(conditions, tenantId, 1);
    const rows = await db.raw(
      `SELECT COUNT(*) as cnt FROM ${table} ${clause}`,
      values,
    ) as Array<Record<string, unknown>>;
    return Number(rows[0]?.cnt ?? 0);
  }

  return { db, tenantId, select, selectOne, insert, update, delete: del, count };
}

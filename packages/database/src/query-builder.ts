// @aeron/database - Query Builder

import type { ModelDefinition } from "./model";

export interface WhereCondition {
  field: string;
  op: "=" | "!=" | ">" | ">=" | "<" | "<=" | "LIKE" | "IN" | "IS NULL" | "IS NOT NULL";
  value?: unknown;
  connector: "AND" | "OR";
}

export interface OrderByClause {
  field: string;
  direction: "asc" | "desc";
}

export interface HavingCondition {
  field: string;
  op: string;
  value: unknown;
}

export interface VersionClause {
  field: string;
  currentVersion: number;
}

export interface QueryBuilder<T = unknown> {
  where(field: string, op: string, value?: unknown): QueryBuilder<T>;
  orWhere(field: string, op: string, value?: unknown): QueryBuilder<T>;
  orderBy(field: string, direction?: "asc" | "desc"): QueryBuilder<T>;
  limit(n: number): QueryBuilder<T>;
  offset(n: number): QueryBuilder<T>;
  select(...fields: string[]): QueryBuilder<T>;

  groupBy(...fields: string[]): QueryBuilder<T>;
  having(field: string, op: string, value: unknown): QueryBuilder<T>;

  batchInsert(rows: Record<string, unknown>[], fields: string[]): QueryBuilder<T>;

  withVersion(field: string, currentVersion: number): QueryBuilder<T>;

  hardDelete(): QueryBuilder<T>;
  restore(): QueryBuilder<T>;
  withDeleted(): QueryBuilder<T>;

  toSQL(): { text: string; params: unknown[] };

  insertData(data: Record<string, unknown>): QueryBuilder<T>;
  updateData(data: Record<string, unknown>): QueryBuilder<T>;
  deleteQuery(): QueryBuilder<T>;

  getOperation(): "select" | "insert" | "update" | "delete";
}

interface QueryState {
  operation: "select" | "insert" | "update" | "delete";
  fields: string[];
  wheres: WhereCondition[];
  orders: OrderByClause[];
  limitVal: number | undefined;
  offsetVal: number | undefined;
  insertValues: Record<string, unknown> | undefined;
  updateValues: Record<string, unknown> | undefined;
  isSoftDelete: boolean;
  groupByFields: string[];
  havings: HavingCondition[];
  batchInsertRows: Record<string, unknown>[] | undefined;
  batchInsertFields: string[] | undefined;
  versionClause: VersionClause | undefined;
  isHardDelete: boolean;
  isRestore: boolean;
  includeDeleted: boolean;
}

function cloneState(state: QueryState): QueryState {
  return {
    operation: state.operation,
    fields: [...state.fields],
    wheres: [...state.wheres],
    orders: [...state.orders],
    limitVal: state.limitVal,
    offsetVal: state.offsetVal,
    insertValues: state.insertValues ? { ...state.insertValues } : undefined,
    updateValues: state.updateValues ? { ...state.updateValues } : undefined,
    isSoftDelete: state.isSoftDelete,
    groupByFields: [...state.groupByFields],
    havings: [...state.havings],
    batchInsertRows: state.batchInsertRows ? state.batchInsertRows.map((r) => ({ ...r })) : undefined,
    batchInsertFields: state.batchInsertFields ? [...state.batchInsertFields] : undefined,
    versionClause: state.versionClause ? { ...state.versionClause } : undefined,
    isHardDelete: state.isHardDelete,
    isRestore: state.isRestore,
    includeDeleted: state.includeDeleted,
  };
}

function buildWhereClause(
  wheres: WhereCondition[],
  isSoftDelete: boolean,
  includeDeleted: boolean,
  startParamIndex: number,
): { clause: string; params: unknown[]; nextParamIndex: number } {
  const params: unknown[] = [];
  let paramIndex = startParamIndex;

  const allWheres = [...wheres];
  if (isSoftDelete && !includeDeleted) {
    allWheres.push({ field: "deleted_at", op: "IS NULL", connector: "AND" });
  }

  if (allWheres.length === 0) {
    return { clause: "", params, nextParamIndex: paramIndex };
  }

  const parts: string[] = [];
  for (let i = 0; i < allWheres.length; i++) {
    const w = allWheres[i]!;
    let expr: string;
    if (w.op === "IS NULL") {
      expr = `${w.field} IS NULL`;
    } else if (w.op === "IS NOT NULL") {
      expr = `${w.field} IS NOT NULL`;
    } else if (w.op === "IN") {
      const values = w.value as unknown[];
      const placeholders = values.map(() => `$${paramIndex++}`);
      params.push(...values);
      expr = `${w.field} IN (${placeholders.join(", ")})`;
    } else {
      expr = `${w.field} ${w.op} $${paramIndex++}`;
      params.push(w.value);
    }

    if (i === 0) {
      parts.push(expr);
    } else {
      parts.push(`${w.connector} ${expr}`);
    }
  }

  return { clause: ` WHERE ${parts.join(" ")}`, params, nextParamIndex: paramIndex };
}

function buildGroupByHaving(
  state: QueryState,
  startParamIndex: number,
): { clause: string; params: unknown[]; nextParamIndex: number } {
  const params: unknown[] = [];
  let paramIndex = startParamIndex;
  let clause = "";

  if (state.groupByFields.length > 0) {
    clause += ` GROUP BY ${state.groupByFields.join(", ")}`;
  }

  if (state.havings.length > 0) {
    const havingParts: string[] = [];
    for (const h of state.havings) {
      havingParts.push(`${h.field} ${h.op} $${paramIndex++}`);
      params.push(h.value);
    }
    clause += ` HAVING ${havingParts.join(" AND ")}`;
  }

  return { clause, params, nextParamIndex: paramIndex };
}

function buildSelectSQL(tableName: string, state: QueryState): { text: string; params: unknown[] } {
  const params: unknown[] = [];
  let paramIndex = 1;

  const fieldList = state.fields.length > 0 ? state.fields.join(", ") : "*";
  let text = `SELECT ${fieldList} FROM ${tableName}`;

  const where = buildWhereClause(state.wheres, state.isSoftDelete, state.includeDeleted, paramIndex);
  text += where.clause;
  params.push(...where.params);
  paramIndex = where.nextParamIndex;

  const groupBy = buildGroupByHaving(state, paramIndex);
  text += groupBy.clause;
  params.push(...groupBy.params);
  paramIndex = groupBy.nextParamIndex;

  if (state.orders.length > 0) {
    const orderParts = state.orders.map((o) => `${o.field} ${o.direction.toUpperCase()}`);
    text += ` ORDER BY ${orderParts.join(", ")}`;
  }

  if (state.limitVal !== undefined) {
    text += ` LIMIT $${paramIndex++}`;
    params.push(state.limitVal);
  }

  if (state.offsetVal !== undefined) {
    text += ` OFFSET $${paramIndex++}`;
    params.push(state.offsetVal);
  }

  return { text, params };
}

function buildInsertSQL(tableName: string, state: QueryState): { text: string; params: unknown[] } {
  // Batch insert
  if (state.batchInsertRows && state.batchInsertFields) {
    const fields = state.batchInsertFields;
    const rows = state.batchInsertRows;
    const params: unknown[] = [];
    let paramIndex = 1;
    const rowPlaceholders: string[] = [];

    for (const row of rows) {
      const placeholders: string[] = [];
      for (const f of fields) {
        placeholders.push(`$${paramIndex++}`);
        params.push(row[f]);
      }
      rowPlaceholders.push(`(${placeholders.join(", ")})`);
    }

    const text = `INSERT INTO ${tableName} (${fields.join(", ")}) VALUES ${rowPlaceholders.join(", ")}`;
    return { text, params };
  }

  // Single insert
  const data = state.insertValues;
  if (!data) {
    return { text: "", params: [] };
  }

  const keys = Object.keys(data);
  const params: unknown[] = [];
  const placeholders: string[] = [];
  let paramIndex = 1;

  for (const key of keys) {
    placeholders.push(`$${paramIndex++}`);
    params.push(data[key]);
  }

  const text = `INSERT INTO ${tableName} (${keys.join(", ")}) VALUES (${placeholders.join(", ")})`;
  return { text, params };
}

function buildUpdateSQL(tableName: string, state: QueryState): { text: string; params: unknown[] } {
  const data = state.updateValues;
  if (!data) {
    return { text: "", params: [] };
  }

  const params: unknown[] = [];
  let paramIndex = 1;
  const setParts: string[] = [];

  for (const key of Object.keys(data)) {
    setParts.push(`${key} = $${paramIndex++}`);
    params.push(data[key]);
  }

  // Optimistic lock: add version = version + 1 to SET
  if (state.versionClause) {
    setParts.push(`${state.versionClause.field} = ${state.versionClause.field} + 1`);
  }

  let text = `UPDATE ${tableName} SET ${setParts.join(", ")}`;

  // Add version check to where conditions
  const wheres = [...state.wheres];
  if (state.versionClause) {
    wheres.push({
      field: state.versionClause.field,
      op: "=",
      value: state.versionClause.currentVersion,
      connector: "AND",
    });
  }

  const where = buildWhereClause(wheres, state.isSoftDelete, state.includeDeleted, paramIndex);
  text += where.clause;
  params.push(...where.params);

  return { text, params };
}

function buildDeleteSQL(tableName: string, state: QueryState): { text: string; params: unknown[] } {
  // Restore: UPDATE ... SET deleted_at = NULL
  if (state.isRestore) {
    const params: unknown[] = [];
    let paramIndex = 1;
    let text = `UPDATE ${tableName} SET deleted_at = NULL`;

    const where = buildWhereClause(state.wheres, false, true, paramIndex);
    text += where.clause;
    params.push(...where.params);

    return { text, params };
  }

  // Hard delete: always physical DELETE, even for softDelete models
  if (state.isHardDelete) {
    const params: unknown[] = [];
    let paramIndex = 1;
    let text = `DELETE FROM ${tableName}`;

    const where = buildWhereClause(state.wheres, false, true, paramIndex);
    text += where.clause;
    params.push(...where.params);

    return { text, params };
  }

  // Soft delete: UPDATE ... SET deleted_at = NOW()
  if (state.isSoftDelete) {
    const params: unknown[] = [];
    let paramIndex = 1;

    let text = `UPDATE ${tableName} SET deleted_at = NOW()`;

    // For soft delete WHERE, include deleted_at IS NULL filter
    const wheres = [...state.wheres];
    wheres.push({ field: "deleted_at", op: "IS NULL", connector: "AND" });

    const where = buildWhereClause(wheres, false, true, paramIndex);
    text += where.clause;
    params.push(...where.params);

    return { text, params };
  }

  // Hard delete (non-softDelete model)
  const params: unknown[] = [];
  let paramIndex = 1;
  let text = `DELETE FROM ${tableName}`;

  const where = buildWhereClause(state.wheres, false, true, paramIndex);
  text += where.clause;
  params.push(...where.params);

  return { text, params };
}

function createBuilder<T>(tableName: string, state: QueryState): QueryBuilder<T> {
  return {
    where(field: string, op: string, value?: unknown): QueryBuilder<T> {
      const next = cloneState(state);
      next.wheres.push({ field, op: op as WhereCondition["op"], value, connector: "AND" });
      return createBuilder<T>(tableName, next);
    },

    orWhere(field: string, op: string, value?: unknown): QueryBuilder<T> {
      const next = cloneState(state);
      next.wheres.push({ field, op: op as WhereCondition["op"], value, connector: "OR" });
      return createBuilder<T>(tableName, next);
    },

    orderBy(field: string, direction: "asc" | "desc" = "asc"): QueryBuilder<T> {
      const next = cloneState(state);
      next.orders.push({ field, direction });
      return createBuilder<T>(tableName, next);
    },

    limit(n: number): QueryBuilder<T> {
      const next = cloneState(state);
      next.limitVal = n;
      return createBuilder<T>(tableName, next);
    },

    offset(n: number): QueryBuilder<T> {
      const next = cloneState(state);
      next.offsetVal = n;
      return createBuilder<T>(tableName, next);
    },

    select(...fields: string[]): QueryBuilder<T> {
      const next = cloneState(state);
      next.fields = fields;
      return createBuilder<T>(tableName, next);
    },

    groupBy(...fields: string[]): QueryBuilder<T> {
      const next = cloneState(state);
      next.groupByFields = fields;
      return createBuilder<T>(tableName, next);
    },

    having(field: string, op: string, value: unknown): QueryBuilder<T> {
      const next = cloneState(state);
      next.havings.push({ field, op, value });
      return createBuilder<T>(tableName, next);
    },

    batchInsert(rows: Record<string, unknown>[], fields: string[]): QueryBuilder<T> {
      const next = cloneState(state);
      next.operation = "insert";
      next.batchInsertRows = rows;
      next.batchInsertFields = fields;
      return createBuilder<T>(tableName, next);
    },

    withVersion(field: string, currentVersion: number): QueryBuilder<T> {
      const next = cloneState(state);
      next.versionClause = { field, currentVersion };
      return createBuilder<T>(tableName, next);
    },

    hardDelete(): QueryBuilder<T> {
      const next = cloneState(state);
      next.operation = "delete";
      next.isHardDelete = true;
      return createBuilder<T>(tableName, next);
    },

    restore(): QueryBuilder<T> {
      const next = cloneState(state);
      next.operation = "delete";
      next.isRestore = true;
      return createBuilder<T>(tableName, next);
    },

    withDeleted(): QueryBuilder<T> {
      const next = cloneState(state);
      next.includeDeleted = true;
      return createBuilder<T>(tableName, next);
    },

    toSQL(): { text: string; params: unknown[] } {
      switch (state.operation) {
        case "select":
          return buildSelectSQL(tableName, state);
        case "insert":
          return buildInsertSQL(tableName, state);
        case "update":
          return buildUpdateSQL(tableName, state);
        case "delete":
          return buildDeleteSQL(tableName, state);
      }
    },

    insertData(data: Record<string, unknown>): QueryBuilder<T> {
      const next = cloneState(state);
      next.operation = "insert";
      next.insertValues = data;
      return createBuilder<T>(tableName, next);
    },

    updateData(data: Record<string, unknown>): QueryBuilder<T> {
      const next = cloneState(state);
      next.operation = "update";
      next.updateValues = data;
      return createBuilder<T>(tableName, next);
    },

    deleteQuery(): QueryBuilder<T> {
      const next = cloneState(state);
      next.operation = "delete";
      return createBuilder<T>(tableName, next);
    },

    getOperation(): "select" | "insert" | "update" | "delete" {
      return state.operation;
    },
  };
}

export function createQueryBuilder<T = unknown>(model: ModelDefinition<T>): QueryBuilder<T> {
  const state: QueryState = {
    operation: "select",
    fields: [],
    wheres: [],
    orders: [],
    limitVal: undefined,
    offsetVal: undefined,
    insertValues: undefined,
    updateValues: undefined,
    isSoftDelete: model.options.softDelete ?? false,
    groupByFields: [],
    havings: [],
    batchInsertRows: undefined,
    batchInsertFields: undefined,
    versionClause: undefined,
    isHardDelete: false,
    isRestore: false,
    includeDeleted: false,
  };

  return createBuilder<T>(model.tableName, state);
}

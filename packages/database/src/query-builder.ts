// @aeron/database - Query Builder

import type { ModelDefinition } from "./model";

export interface WhereCondition {
  field: string;
  op: "=" | "!=" | ">" | ">=" | "<" | "<=" | "LIKE" | "IN" | "IS NULL" | "IS NOT NULL";
  value?: unknown;
}

export interface OrderByClause {
  field: string;
  direction: "asc" | "desc";
}

export interface QueryBuilder<T = unknown> {
  where(field: string, op: string, value?: unknown): QueryBuilder<T>;
  orderBy(field: string, direction?: "asc" | "desc"): QueryBuilder<T>;
  limit(n: number): QueryBuilder<T>;
  offset(n: number): QueryBuilder<T>;
  select(...fields: string[]): QueryBuilder<T>;

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
  };
}

function buildSelectSQL(tableName: string, state: QueryState): { text: string; params: unknown[] } {
  const params: unknown[] = [];
  let paramIndex = 1;

  const fieldList = state.fields.length > 0 ? state.fields.join(", ") : "*";
  let text = `SELECT ${fieldList} FROM ${tableName}`;

  // Collect all where conditions, including soft delete filter
  const allWheres = [...state.wheres];
  if (state.isSoftDelete) {
    allWheres.push({ field: "deleted_at", op: "IS NULL" });
  }

  if (allWheres.length > 0) {
    const whereParts: string[] = [];
    for (const w of allWheres) {
      if (w.op === "IS NULL") {
        whereParts.push(`${w.field} IS NULL`);
      } else if (w.op === "IS NOT NULL") {
        whereParts.push(`${w.field} IS NOT NULL`);
      } else if (w.op === "IN") {
        const values = w.value as unknown[];
        const placeholders = values.map(() => `$${paramIndex++}`);
        params.push(...values);
        whereParts.push(`${w.field} IN (${placeholders.join(", ")})`);
      } else {
        whereParts.push(`${w.field} ${w.op} $${paramIndex++}`);
        params.push(w.value);
      }
    }
    text += ` WHERE ${whereParts.join(" AND ")}`;
  }

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

  let text = `UPDATE ${tableName} SET ${setParts.join(", ")}`;

  // Collect all where conditions, including soft delete filter
  const allWheres = [...state.wheres];
  if (state.isSoftDelete) {
    allWheres.push({ field: "deleted_at", op: "IS NULL" });
  }

  if (allWheres.length > 0) {
    const whereParts: string[] = [];
    for (const w of allWheres) {
      if (w.op === "IS NULL") {
        whereParts.push(`${w.field} IS NULL`);
      } else if (w.op === "IS NOT NULL") {
        whereParts.push(`${w.field} IS NOT NULL`);
      } else if (w.op === "IN") {
        const values = w.value as unknown[];
        const placeholders = values.map(() => `$${paramIndex++}`);
        params.push(...values);
        whereParts.push(`${w.field} IN (${placeholders.join(", ")})`);
      } else {
        whereParts.push(`${w.field} ${w.op} $${paramIndex++}`);
        params.push(w.value);
      }
    }
    text += ` WHERE ${whereParts.join(" AND ")}`;
  }

  return { text, params };
}

function buildDeleteSQL(tableName: string, state: QueryState): { text: string; params: unknown[] } {
  // Soft delete: UPDATE ... SET deleted_at = NOW()
  if (state.isSoftDelete) {
    const softState = cloneState(state);
    softState.updateValues = { deleted_at: "NOW()" };
    // For soft delete, we build a special UPDATE with raw NOW()
    const params: unknown[] = [];
    let paramIndex = 1;

    let text = `UPDATE ${tableName} SET deleted_at = NOW()`;

    const allWheres = [...state.wheres];
    allWheres.push({ field: "deleted_at", op: "IS NULL" });

    if (allWheres.length > 0) {
      const whereParts: string[] = [];
      for (const w of allWheres) {
        if (w.op === "IS NULL") {
          whereParts.push(`${w.field} IS NULL`);
        } else if (w.op === "IS NOT NULL") {
          whereParts.push(`${w.field} IS NOT NULL`);
        } else if (w.op === "IN") {
          const values = w.value as unknown[];
          const placeholders = values.map(() => `$${paramIndex++}`);
          params.push(...values);
          whereParts.push(`${w.field} IN (${placeholders.join(", ")})`);
        } else {
          whereParts.push(`${w.field} ${w.op} $${paramIndex++}`);
          params.push(w.value);
        }
      }
      text += ` WHERE ${whereParts.join(" AND ")}`;
    }

    return { text, params };
  }

  // Hard delete
  const params: unknown[] = [];
  let paramIndex = 1;
  let text = `DELETE FROM ${tableName}`;

  if (state.wheres.length > 0) {
    const whereParts: string[] = [];
    for (const w of state.wheres) {
      if (w.op === "IS NULL") {
        whereParts.push(`${w.field} IS NULL`);
      } else if (w.op === "IS NOT NULL") {
        whereParts.push(`${w.field} IS NOT NULL`);
      } else if (w.op === "IN") {
        const values = w.value as unknown[];
        const placeholders = values.map(() => `$${paramIndex++}`);
        params.push(...values);
        whereParts.push(`${w.field} IN (${placeholders.join(", ")})`);
      } else {
        whereParts.push(`${w.field} ${w.op} $${paramIndex++}`);
        params.push(w.value);
      }
    }
    text += ` WHERE ${whereParts.join(" AND ")}`;
  }

  return { text, params };
}

function createBuilder<T>(tableName: string, state: QueryState): QueryBuilder<T> {
  return {
    where(field: string, op: string, value?: unknown): QueryBuilder<T> {
      const next = cloneState(state);
      next.wheres.push({ field, op: op as WhereCondition["op"], value });
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
  };

  return createBuilder<T>(model.tableName, state);
}

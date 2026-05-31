# Database Security Audit
## 1. Query Builder
```typescript
/**
 * @ventostack/database — 查询构建器
 * 提供不可变状态、链式调用的 SQL 构建能力，支持 SELECT / INSERT / UPDATE / DELETE 及软删除
 * 所有链式方法返回新的不可变实例，保证线程安全与可预测性
 */

import type { ModelDefinition } from "./model";

/** 默认最大 limit 值 */
const DEFAULT_MAX_LIMIT = 1000;

/** 合法的 SQL 标识符正则 */
const VALID_IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * 验证字段名是否合法，不合法则抛出 TypeError。
 */
function assertValidIdentifier(name: string, context: string): void {
  if (!VALID_IDENTIFIER_RE.test(name)) {
    throw new TypeError(
      `Invalid SQL identifier in ${context}: "${name}". Identifiers must match /^[a-zA-Z_][a-zA-Z0-9_]*$/`,
    );
  }
}

/**
 * 验证 limit / offset 数值。
 */
function assertValidLimit(n: number, maxLimit: number): void {
  if (!Number.isFinite(n) || Number.isNaN(n) || !Number.isInteger(n) || n < 0 || n > maxLimit) {
    throw new RangeError(`limit must be a non-negative integer <= ${maxLimit}, got ${n}`);
  }
}

function assertValidOffset(n: number): void {
  if (!Number.isFinite(n) || Number.isNaN(n) || !Number.isInteger(n) || n < 0) {
    throw new RangeError(`offset must be a non-negative integer, got ${n}`);
  }
}

/**
 * WHERE 条件单元。
 */
export interface WhereCondition {
  /** 字段名 */
  field: string;
  /** 比较操作符 */
  op: "=" | "!=" | ">" | ">=" | "<" | "<=" | "LIKE" | "IN" | "IS NULL" | "IS NOT NULL";
  /** 比较值（IS NULL / IS NOT NULL 时可选） */
  value?: unknown;
  /** 与前一条件的连接方式（AND / OR） */
  connector: "AND" | "OR";
}

/**
 * ORDER BY 子句单元。
 */
export interface OrderByClause {
  /** 排序字段 */
  field: string;
  /** 排序方向 */
  direction: "asc" | "desc";
}

/**
 * HAVING 条件单元。
 */
export interface HavingCondition {
  /** 字段名 */
  field: string;
  /** 比较操作符 */
  op: string;
  /** 比较值 */
  value: unknown;
  /** 与前一条件的连接方式（AND / OR） */
  connector?: "AND" | "OR";
}

/**
 * 乐观锁版本子句。
 */
export interface VersionClause {
  /** 版本字段名 */
  field: string;
  /** 当前版本号 */
  currentVersion: number;
}

/**
 * 所有支持的 WHERE 操作符联合类型。
 */
export type WhereOp = WhereCondition["op"];

/**
 * 查询构建器接口，所有方法返回新的不可变实例。
 * @template T — 模型行类型
 */
export interface QueryBuilder<T = unknown> {
  // WHERE
  where(field: keyof T, op: "IS NULL" | "IS NOT NULL"): QueryBuilder<T>;
  where(
    field: keyof T,
    op: Exclude<WhereOp, "IS NULL" | "IS NOT NULL">,
    value: unknown,
  ): QueryBuilder<T>;
  where(field: keyof T, op: WhereOp, value?: unknown): QueryBuilder<T>;
  orWhere(field: keyof T, op: "IS NULL" | "IS NOT NULL"): QueryBuilder<T>;
  orWhere(
    field: keyof T,
    op: Exclude<WhereOp, "IS NULL" | "IS NOT NULL">,
    value: unknown,
  ): QueryBuilder<T>;
  orWhere(field: keyof T, op: WhereOp, value?: unknown): QueryBuilder<T>;

  // 排序与分页
  /** 按字段排序（默认升序） */
  orderBy(field: keyof T, direction?: "asc" | "desc"): QueryBuilder<T>;
  /** 限制返回条数 */
  limit(n: number): QueryBuilder<T>;
  /** 跳过前 n 条 */
  offset(n: number): QueryBuilder<T>;
  /** 清除 limit 限制 */
  clearLimit(): QueryBuilder<T>;
  /** 清除 offset 跳过 */
  clearOffset(): QueryBuilder<T>;
  /** 是否已设置 limit */
  hasLimit(): boolean;
  /** 选择返回字段（传入空数组则 SELECT *） */
  select<K extends keyof T>(...fields: K[]): QueryBuilder<T>;

  // 分组与过滤
  /** 按字段分组 */
  groupBy(...fields: (keyof T)[]): QueryBuilder<T>;
  /** 对分组结果添加 HAVING 条件 */
  having(field: keyof T, op: string, value: unknown): QueryBuilder<T>;
  /** 对分组结果添加 OR HAVING 条件 */
  orHaving(field: keyof T, op: string, value: unknown): QueryBuilder<T>;

  // 批量插入
  /**
   * 批量插入数据。
   * @param rows — 待插入的行数据数组
   * @param fields — 要插入的字段列表（可选，默认取第一行对象的键）
   */
  batchInsert(rows: Record<string, unknown>[], fields?: string[]): QueryBuilder<T>;

  // 乐观锁
  /**
   * 启用乐观锁（UPDATE 时自动 version + 1 并校验）。
   * @param field — 版本字段名
   * @param currentVersion — 当前版本号
   */
  withVersion(field: keyof T, currentVersion: number): QueryBuilder<T>;

  // 删除与恢复
  /** 标记为物理删除（无视 softDelete） */
  hardDelete(): QueryBuilder<T>;
  /** 标记为恢复软删除（将 deleted_at 置 NULL） */
  restore(): QueryBuilder<T>;
  /** 查询时包含已软删除的行 */
  withDeleted(): QueryBuilder<T>;

  // SQL 生成
  /** 生成最终 SQL 文本与参数数组 */
  toSQL(): { text: string; params: unknown[] };

  // 内部状态转换（由 database.ts 调用）
  /** 设置为单条插入模式 */
  insertData(data: Record<string, unknown>): QueryBuilder<T>;
  /** 设置为更新模式 */
  updateData(data: Record<string, unknown>): QueryBuilder<T>;
  /** 设置为删除模式 */
  deleteQuery(): QueryBuilder<T>;

  /** 获取当前操作类型 */
  getOperation(): "select" | "insert" | "update" | "delete";
}

/**
 * 查询内部状态，记录所有链式调用累积的条件与配置。
 */
interface QueryState {
  /** 当前操作类型 */
  operation: "select" | "insert" | "update" | "delete";
  /** SELECT 字段列表 */
  fields: string[];
  /** WHERE 条件列表 */
  wheres: WhereCondition[];
  /** ORDER BY 列表 */
  orders: OrderByClause[];
  /** LIMIT 值 */
  limitVal: number | undefined;
  /** OFFSET 值 */
  offsetVal: number | undefined;
  /** 单条插入数据 */
  insertValues: Record<string, unknown> | undefined;
  /** 更新数据 */
  updateValues: Record<string, unknown> | undefined;
  /** 是否启用软删除 */
  isSoftDelete: boolean;
  /** GROUP BY 字段 */
  groupByFields: string[];
  /** HAVING 条件 */
  havings: HavingCondition[];
  /** 批量插入行数据 */
  batchInsertRows: Record<string, unknown>[] | undefined;
  /** 批量插入字段 */
  batchInsertFields: string[] | undefined;
  /** 乐观锁子句 */
  versionClause: VersionClause | undefined;
  /** 是否强制物理删除 */
  isHardDelete: boolean;
  /** 是否恢复软删除 */
  isRestore: boolean;
  /** 查询时是否包含已删除行 */
  includeDeleted: boolean;
  /** 最大 limit 值 */
  maxLimit: number;
}

/**
 * 深拷贝查询状态，保证不可变性。
 * @param state — 当前状态
 * @returns 新的状态副本
 */
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
    batchInsertRows: state.batchInsertRows
      ? state.batchInsertRows.map((r) => ({ ...r }))
      : undefined,
    batchInsertFields: state.batchInsertFields ? [...state.batchInsertFields] : undefined,
    versionClause: state.versionClause ? { ...state.versionClause } : undefined,
    isHardDelete: state.isHardDelete,
    isRestore: state.isRestore,
    includeDeleted: state.includeDeleted,
    maxLimit: state.maxLimit,
  };
}

/**
 * 将条件列表按 connector 分组，对包含 OR 的组包裹括号。
 */
function buildConditionGroup(
  conditions: Array<{ field: string; op: string; value?: unknown; connector?: "AND" | "OR" }>,
  startParamIndex: number,
  paramPusher: (v: unknown) => void,
): { text: string; nextParamIndex: number } {
  const pushParams = (...vals: unknown[]) => {
    for (const v of vals) paramPusher(v);
  };
  let paramIndex = startParamIndex;
  if (conditions.length === 0) {
    return { text: "", nextParamIndex: paramIndex };
  }

  // 按 AND 切分，OR 条件归入同一组
  const groups: Array<{ items: typeof conditions; hasOr: boolean }> = [];
  let currentGroup: typeof conditions = [conditions[0]!];
  let currentHasOr = false;

  for (let i = 1; i < conditions.length; i++) {
    const cond = conditions[i]!;
    if (cond.connector === "OR") {
      currentHasOr = true;
      currentGroup.push(cond);
    } else {
      groups.push({ items: currentGroup, hasOr: currentHasOr });
      currentGroup = [cond];
      currentHasOr = false;
    }
  }
  groups.push({ items: currentGroup, hasOr: currentHasOr });

  const groupTexts: string[] = [];
  for (const group of groups) {
    const parts: string[] = [];
    for (let i = 0; i < group.items.length; i++) {
      const item = group.items[i]!;
      let expr: string;
      if (item.op === "IS NULL" || (item.op === "IS" && item.value === null)) {
        expr = `${item.field} IS NULL`;
      } else if (item.op === "IS NOT NULL" || (item.op === "IS NOT" && item.value === null)) {
        expr = `${item.field} IS NOT NULL`;
      } else if (item.op === "IN") {
        const values = item.value as unknown[];
        const placeholders = values.map(() => `$${paramIndex++}`);
        pushParams(...values);
        expr = `${item.field} IN (${placeholders.join(", ")})`;
      } else {
        expr = `${item.field} ${item.op} $${paramIndex++}`;
        pushParams(item.value);
      }
      if (i === 0) {
        parts.push(expr);
      } else {
        parts.push(`OR ${expr}`);
      }
    }
    const joined = parts.join(" ");
    groupTexts.push(group.hasOr ? `(${joined})` : joined);
  }

  return { text: groupTexts.join(" AND "), nextParamIndex: paramIndex };
}

/**
 * 构建 WHERE 子句及参数列表。
 * @param wheres — WHERE 条件数组
 * @param isSoftDelete — 当前模型是否启用软删除
 * @param includeDeleted — 是否包含已软删除行
 * @param startParamIndex — 参数起始索引（从 1 开始）
 * @returns 子句文本、参数数组与下一个参数索引
 */
function buildWhereClause(
  wheres: WhereCondition[],
  isSoftDelete: boolean,
  includeDeleted: boolean,
  startParamIndex: number,
): { clause: string; params: unknown[]; nextParamIndex: number } {
  const params: unknown[] = [];

  const allWheres = [...wheres];
  if (isSoftDelete && !includeDeleted) {
    allWheres.push({ field: "deleted_at", op: "IS NULL", connector: "AND" });
  }

  if (allWheres.length === 0) {
    return { clause: "", params, nextParamIndex: startParamIndex };
  }

  const { text, nextParamIndex } = buildConditionGroup(allWheres, startParamIndex, (...vals) =>
    params.push(...vals),
  );

  return { clause: ` WHERE ${text}`, params, nextParamIndex };
}

/**
 * 构建 GROUP BY 与 HAVING 子句。
 * @param state — 查询状态
 * @param startParamIndex — 参数起始索引
 * @returns 子句文本、参数数组与下一个参数索引
 */
function buildGroupByHaving(
  state: QueryState,
  startParamIndex: number,
): { clause: string; params: unknown[]; nextParamIndex: number } {
  const params: unknown[] = [];
  let clause = "";

  if (state.groupByFields.length > 0) {
    clause += ` GROUP BY ${state.groupByFields.join(", ")}`;
  }

  if (state.havings.length > 0) {
    const { text, nextParamIndex } = buildConditionGroup(
      state.havings,
      startParamIndex,
      (...vals) => params.push(...vals),
    );
    clause += ` HAVING ${text}`;
    return { clause, params, nextParamIndex };
  }

  return { clause, params, nextParamIndex: startParamIndex };
}

/**
 * 构建 SELECT 语句。
 * @param tableName — 表名
 * @param state — 查询状态
 * @returns SQL 文本与参数数组
 */
function buildSelectSQL(tableName: string, state: QueryState): { text: string; params: unknown[] } {
  const params: unknown[] = [];
  let paramIndex = 1;

  const fieldList = state.fields.length > 0 ? state.fields.join(", ") : "*";
  let text = `SELECT ${fieldList} FROM ${tableName}`;

  const where = buildWhereClause(
    state.wheres,
    state.isSoftDelete,
    state.includeDeleted,
    paramIndex,
  );
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

/**
 * 构建 INSERT 语句。
 * @param tableName — 表名
 * @param state — 查询状态
 * @returns SQL 文本与参数数组
 */
function buildInsertSQL(tableName: string, state: QueryState): { text: string; params: unknown[] } {
  // 批量插入
  if (state.batchInsertRows && state.batchInsertRows.length > 0 && state.batchInsertFields) {
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

  // 单行插入
  const data = state.insertValues;
  if (!data || Object.keys(data).length === 0) {
    throw new TypeError(
      "INSERT operation requires insert data. Call insertData() or batchInsert() before toSQL().",
    );
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

/**
 * 构建 UPDATE 语句（支持乐观锁）。
 * @param tableName — 表名
 * @param state — 查询状态
 * @returns SQL 文本与参数数组
 */
function buildUpdateSQL(tableName: string, state: QueryState): { text: string; params: unknown[] } {
  const data = state.updateValues;
  if (!data || Object.keys(data).length === 0) {
    throw new TypeError("UPDATE operation requires update data. Call updateData() before toSQL().");
  }

  const params: unknown[] = [];
  let paramIndex = 1;
  const setParts: string[] = [];

  for (const key of Object.keys(data)) {
    setParts.push(`${key} = $${paramIndex++}`);
    params.push(data[key]);
  }

  // 乐观锁：SET 中自动 version = version + 1
  if (state.versionClause) {
    setParts.push(`${state.versionClause.field} = ${state.versionClause.field} + 1`);
  }

  let text = `UPDATE ${tableName} SET ${setParts.join(", ")}`;

  // 乐观锁：WHERE 中追加 version = currentVersion
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

/**
 * 构建 DELETE 语句（支持软删除、恢复、物理删除）。
 * @param tableName — 表名
 * @param state — 查询状态
 * @returns SQL 文本与参数数组
 */
function buildDeleteSQL(tableName: string, state: QueryState): { text: string; params: unknown[] } {
  // 恢复：UPDATE ... SET deleted_at = NULL
  if (state.isRestore) {
    const params: unknown[] = [];
    const paramIndex = 1;
    let text = `UPDATE ${tableName} SET deleted_at = NULL`;

    const where = buildWhereClause(state.wheres, false, true, paramIndex);
    text += where.clause;
    params.push(...where.params);

    return { text, params };
  }

  // 物理删除：无视 softDelete 直接 DELETE
  if (state.isHardDelete) {
    const params: unknown[] = [];
    const paramIndex = 1;
    let text = `DELETE FROM ${tableName}`;

    const where = buildWhereClause(state.wheres, false, true, paramIndex);
    text += where.clause;
    params.push(...where.params);

    return { text, params };
  }

  // 软删除：UPDATE ... SET deleted_at = NOW()
  if (state.isSoftDelete) {
    const params: unknown[] = [];
    const paramIndex = 1;

    let text = `UPDATE ${tableName} SET deleted_at = NOW()`;

    // 软删除 WHERE 追加 deleted_at IS NULL，防止重复删除
    const wheres = [...state.wheres];
    wheres.push({ field: "deleted_at", op: "IS NULL", connector: "AND" });

    const where = buildWhereClause(wheres, false, true, paramIndex);
    text += where.clause;
    params.push(...where.params);

    return { text, params };
  }

  // 普通硬删除（非 softDelete 模型）
  const params: unknown[] = [];
  const paramIndex = 1;
  let text = `DELETE FROM ${tableName}`;

  const where = buildWhereClause(state.wheres, false, true, paramIndex);
  text += where.clause;
  params.push(...where.params);

  return { text, params };
}

/**
 * 创建不可变查询构建器实例。
 * @param tableName — 表名
 * @param state — 当前查询状态
 * @returns QueryBuilder 实例
 */
function createBuilder<T>(tableName: string, state: QueryState): QueryBuilder<T> {
  return {
    where(field: keyof T, op: WhereOp, value?: unknown): QueryBuilder<T> {
      assertValidIdentifier(field as string, "where");
      if (op === "IN" && Array.isArray(value) && value.length === 0) {
        throw new TypeError("IN clause requires a non-empty array");
      }
      const next = cloneState(state);
      next.wheres.push({ field: field as string, op, value, connector: "AND" });
      return createBuilder<T>(tableName, next);
    },

    orWhere(field: keyof T, op: WhereOp, value?: unknown): QueryBuilder<T> {
      assertValidIdentifier(field as string, "orWhere");
      if (op === "IN" && Array.isArray(value) && value.length === 0) {
        throw new TypeError("IN clause requires a non-empty array");
      }
      const next = cloneState(state);
      next.wheres.push({ field: field as string, op, value, connector: "OR" });
      return createBuilder<T>(tableName, next);
    },

    orderBy(field: keyof T, direction: "asc" | "desc" = "asc"): QueryBuilder<T> {
      assertValidIdentifier(field as string, "orderBy");
      const next = cloneState(state);
      next.orders.push({ field: field as string, direction });
      return createBuilder<T>(tableName, next);
    },

    limit(n: number): QueryBuilder<T> {
      assertValidLimit(n, state.maxLimit);
      const next = cloneState(state);
      next.limitVal = n;
      return createBuilder<T>(tableName, next);
    },

    offset(n: number): QueryBuilder<T> {
      assertValidOffset(n);
      const next = cloneState(state);
      next.offsetVal = n;
      return createBuilder<T>(tableName, next);
    },

    clearLimit(): QueryBuilder<T> {
      const next = cloneState(state);
      next.limitVal = undefined;
      return createBuilder<T>(tableName, next);
    },

    clearOffset(): QueryBuilder<T> {
      const next = cloneState(state);
      next.offsetVal = undefined;
      return createBuilder<T>(tableName, next);
    },

    hasLimit(): boolean {
      return state.limitVal !== undefined;
    },

    select<K extends keyof T>(...fields: K[]): QueryBuilder<T> {
      const next = cloneState(state);
      next.fields = fields as string[];
      return createBuilder<T>(tableName, next);
    },

    groupBy(...fields: (keyof T)[]): QueryBuilder<T> {
      for (const f of fields) {
        assertValidIdentifier(f as string, "groupBy");
      }
      const next = cloneState(state);
      next.groupByFields = fields as string[];
      return createBuilder<T>(tableName, next);
    },

    having(field: keyof T, op: string, value: unknown): QueryBuilder<T> {
      const next = cloneState(state);
      next.havings.push({ field: field as string, op, value, connector: "AND" });
      return createBuilder<T>(tableName, next);
    },

    orHaving(field: keyof T, op: string, value: unknown): QueryBuilder<T> {
      const next = cloneState(state);
      next.havings.push({ field: field as string, op, value, connector: "OR" });
      return createBuilder<T>(tableName, next);
    },

    batchInsert(rows: Record<string, unknown>[], fields?: string[]): QueryBuilder<T> {
      if (rows.length === 0) {
        throw new TypeError("batchInsert requires at least one row");
      }
      const resolvedFields = fields && fields.length > 0 ? fields : Object.keys(rows[0] ?? {});
      for (const f of resolvedFields) {
        assertValidIdentifier(f, "batchInsert");
      }
      const next = cloneState(state);
      next.operation = "insert";
      next.batchInsertRows = rows;
      next.batchInsertFields = resolvedFields;
      return createBuilder<T>(tableName, next);
    },

    withVersion(field: keyof T, currentVersion: number): QueryBuilder<T> {
      assertValidIdentifier(field as string, "withVersion");
      const next = cloneState(state);
      next.versionClause = { field: field as string, currentVersion };
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

/**
 * 基于模型定义创建初始查询构建器。
 * @template T — 模型行类型
 * @param model — 模型定义
 * @param options — 可选配置
 * @returns 初始 QueryBuilder 实例（默认 select 操作）
 */
export function createQueryBuilder<T = unknown>(
  model: ModelDefinition<T>,
  options?: { maxLimit?: number },
): QueryBuilder<T> {
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
    maxLimit: options?.maxLimit ?? DEFAULT_MAX_LIMIT,
  };

  return createBuilder<T>(model.tableName, state);
}
```
## 2. Schema Reader
```typescript
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
```
## 3. Model Definition
```typescript
/**
 * @ventostack/database — 模型定义
 * 提供无 class 的列类型工厂、模型定义函数与类型推导工具
 * 所有列类型均携带编译期类型信息，支持 nullable、default、primary 等约束
 */

/**
 * 列级选项，用于控制字段约束与行为。
 */
export interface ColumnOptions {
  /** 是否为主键 */
  primary?: boolean;
  /** 是否自增 */
  autoIncrement?: boolean;
  /** 是否唯一 */
  unique?: boolean;
  /** 是否允许为空 */
  nullable?: boolean;
  /** 默认值 */
  default?: unknown;
  /** 长度限制（如 varchar 长度） */
  length?: number;
  /** 字段注释 */
  comment?: string;
  /** 枚举可选值（仅 enum 类型使用） */
  values?: readonly string[];
}

/**
 * 列定义，携带 TypeScript 类型信息。
 * @template T — 该列对应的 TypeScript 类型
 */
export interface ColumnDef<T = unknown> {
  /** 数据库类型名称（如 bigint、varchar、json 等） */
  type: string;
  /** 列选项（约束、默认值等） */
  options: ColumnOptions;
  /** 编译期类型标记（无运行时值，仅用于类型推导） */
  $type?: T;
}

/**
 * 模型级选项，控制表级行为。
 */
export interface ModelOptions {
  /** 表注释 */
  comment?: string;
  /** 是否启用软删除（自动维护 deleted_at） */
  softDelete?: boolean;
  /** 是否自动维护 created_at / updated_at */
  timestamps?: boolean;
}

/**
 * 从 ColumnDef 推断列的输出类型（处理 nullable）。
 * 若列允许为空，则推导为 V | null，否则为 V。
 * @template T — ColumnDef 类型
 */
export type InferColumnType<T extends ColumnDef> = T extends ColumnDef<infer V>
  ? T["options"] extends { nullable: true }
    ? V | null
    : V
  : unknown;

/**
 * 从 columns 对象推断整行类型。
 * @template T — Record<string, ColumnDef> 的列定义对象
 */
export type InferRowType<T extends Record<string, ColumnDef>> = {
  [K in keyof T]: T[K] extends ColumnDef ? InferColumnType<T[K]> : unknown;
};

/**
 * 模型定义，包含表名、列定义、选项与行类型标记。
 * @template T — 行类型（由 defineModel 自动推导）
 */
export interface ModelDefinition<T = Record<string, unknown>> {
  /** 数据库表名 */
  tableName: string;
  /** 列定义映射（字段名 → ColumnDef） */
  columns: Record<string, ColumnDef>;
  /** 模型级选项 */
  options: ModelOptions;
  /** 编译期行类型标记（无运行时值） */
  $type: T;
}

/**
 * 创建列定义对象，保留具体选项类型以支持编译期 nullable 推导。
 * @template T — 列的 TypeScript 类型
 * @template Opts — 具体的列选项类型
 * @param type — 数据库类型名称
 * @param opts — 列选项
 * @returns ColumnDef 对象（options 字段保留具体类型）
 */
function createColumnDef<T, Opts extends ColumnOptions = ColumnOptions>(
  type: string,
  opts?: Opts,
): ColumnDef<T> & { options: Opts } {
  return { type, options: (opts ?? {}) as Opts } as ColumnDef<T> & { options: Opts };
}

/**
 * 列类型工厂，提供常用数据库类型的类型安全构造方法。
 * 每个方法保留传入选项的具体类型，使 InferColumnType 能在编译期检测 nullable。
 */
export const column = {
  /** 64 位整型 */
  bigint<Opts extends ColumnOptions = ColumnOptions>(
    opts?: Opts,
  ): ColumnDef<bigint> & { options: Opts } {
    return createColumnDef<bigint, Opts>("bigint", opts);
  },
  /** 32 位整型 */
  int<Opts extends ColumnOptions = ColumnOptions>(
    opts?: Opts,
  ): ColumnDef<number> & { options: Opts } {
    return createColumnDef<number, Opts>("int", opts);
  },
  /** 变长字符串 */
  varchar<Opts extends ColumnOptions = ColumnOptions>(
    opts?: Opts,
  ): ColumnDef<string> & { options: Opts } {
    return createColumnDef<string, Opts>("varchar", opts);
  },
  /** 长文本 */
  text<Opts extends ColumnOptions = ColumnOptions>(
    opts?: Opts,
  ): ColumnDef<string> & { options: Opts } {
    return createColumnDef<string, Opts>("text", opts);
  },
  /** 布尔值 */
  boolean<Opts extends ColumnOptions = ColumnOptions>(
    opts?: Opts,
  ): ColumnDef<boolean> & { options: Opts } {
    return createColumnDef<boolean, Opts>("boolean", opts);
  },
  /** 时间戳 */
  timestamp<Opts extends ColumnOptions = ColumnOptions>(
    opts?: Opts,
  ): ColumnDef<Date> & { options: Opts } {
    return createColumnDef<Date, Opts>("timestamp", opts);
  },
  /**
   * JSON 列。
   * @template T — JSON 反序列化后的 TypeScript 类型
   */
  json<T = unknown, Opts extends ColumnOptions = ColumnOptions>(
    opts?: Opts,
  ): ColumnDef<T> & { options: Opts } {
    return createColumnDef<T, Opts>("json", opts);
  },
  /**
   * 枚举列。
   * @template T — 枚举字符串字面量联合类型
   * @param opts — 必须包含 values 数组
   */
  enum<
    T extends string,
    Opts extends ColumnOptions & { values: readonly T[] } = ColumnOptions & {
      values: readonly T[];
    },
  >(opts: Opts): ColumnDef<T> & { options: Opts } {
    return createColumnDef<T, Opts>("enum", opts);
  },
  /**
   * 定点数（以字符串存储，避免浮点精度问题）。
   * @param opts — 可包含 precision（精度）与 scale（小数位）
   */
  decimal<
    Opts extends ColumnOptions & { precision?: number; scale?: number } = ColumnOptions & {
      precision?: number;
      scale?: number;
    },
  >(opts?: Opts): ColumnDef<string> & { options: Opts } {
    return createColumnDef<string, Opts>("decimal", opts);
  },
};

/**
 * 定义数据模型。
 * @template T — 列定义对象类型（Record<string, ColumnDef>）
 * @param tableName — 数据库表名
 * @param columns — 列定义对象
 * @param options — 模型级选项（软删除、时间戳等）
 * @returns 携带完整行类型的 ModelDefinition
 */
/**
 * 根据 ModelOptions 判断是否启用时间戳列。
 * timestamps 默认为 true，除非显式传入 false。
 */
type HasTimestamps<O extends ModelOptions | undefined> = O extends { timestamps: false }
  ? false
  : true;

/**
 * 根据 ModelOptions 判断是否启用软删除列。
 */
type HasSoftDelete<O extends ModelOptions | undefined> = O extends { softDelete: true }
  ? true
  : false;

/**
 * 根据选项向行类型追加自动维护的列。
 */
type WithAutoColumns<Row, O extends ModelOptions | undefined> = Row &
  (HasTimestamps<O> extends true ? { created_at: Date; updated_at: Date } : unknown) &
  (HasSoftDelete<O> extends true ? { deleted_at: Date | null } : unknown);

export function defineModel<
  T extends Record<string, ColumnDef>,
  O extends ModelOptions = ModelOptions,
>(
  tableName: string,
  columns: T,
  options?: O,
): ModelDefinition<WithAutoColumns<InferRowType<T>, O>> {
  const resolvedOptions: ModelOptions = {
    softDelete: options?.softDelete ?? false,
    timestamps: options?.timestamps ?? true,
  };
  if (options?.comment) {
    resolvedOptions.comment = options.comment;
  }

  return {
    tableName,
    columns,
    options: resolvedOptions,
    $type: undefined as unknown as WithAutoColumns<InferRowType<T>, O>,
  };
}
```
## 4. Database Executor
```typescript
/**
 * @ventostack/database — 数据库管理器
 * 提供基于 Model 的链式查询、原始 SQL 执行、事务与连接生命周期管理
 * 支持 Bun.sql（PostgreSQL）与 bun:sqlite（SQLite）两种原生驱动
 */

import type { ModelDefinition } from "./model";
import { createQueryBuilder } from "./query-builder";
import type { QueryBuilder, WhereOp } from "./query-builder";

/**
 * SQL 执行器函数签名。
 * @param text — SQL 文本（使用 $1, $2 占位符）
 * @param params — 与占位符对应的参数数组
 * @returns 查询结果数组
 */
export type SqlExecutor = (text: string, params?: unknown[]) => Promise<unknown[]>;

/**
 * 数据库连接配置项。
 */
export interface DatabaseConfig {
  /** 数据库主机地址 */
  host?: string;
  /** 数据库端口 */
  port?: number;
  /** 数据库名称 */
  database?: string;
  /** 用户名 */
  username?: string;
  /** 密码 */
  password?: string;
  /** 连接 URL（优先于 host/port 等独立字段） */
  url?: string;
  /** 最大连接数 */
  max?: number;
  /** 空闲超时（毫秒） */
  idle?: number;
  /** 连接超时（毫秒） */
  timeout?: number;
  /** 自定义 SQL 执行器（用于测试或代理场景） */
  executor?: SqlExecutor;
}

/**
 * 面向具体模型的查询执行器，支持链式条件、排序、分页、聚合与写操作。
 * @template T — 模型对应的行类型
 * @template S — 当前选中的字段子集（默认全部字段）
 */
export interface QueryExecutor<T, S extends keyof T = keyof T> {
  // WHERE 条件
  where(field: keyof T, op: "IS NULL" | "IS NOT NULL"): QueryExecutor<T, S>;
  where(
    field: keyof T,
    op: Exclude<WhereOp, "IS NULL" | "IS NOT NULL">,
    value: unknown,
  ): QueryExecutor<T, S>;
  where(field: keyof T, op: WhereOp, value?: unknown): QueryExecutor<T, S>;
  orWhere(field: keyof T, op: "IS NULL" | "IS NOT NULL"): QueryExecutor<T, S>;
  orWhere(
    field: keyof T,
    op: Exclude<WhereOp, "IS NULL" | "IS NOT NULL">,
    value: unknown,
  ): QueryExecutor<T, S>;
  orWhere(field: keyof T, op: WhereOp, value?: unknown): QueryExecutor<T, S>;

  // 排序与分页
  /** 按字段排序（默认升序） */
  orderBy(field: keyof T, direction?: "asc" | "desc"): QueryExecutor<T, S>;
  /** 限制返回条数 */
  limit(n: number): QueryExecutor<T, S>;
  /** 跳过前 n 条 */
  offset(n: number): QueryExecutor<T, S>;
  /** 选择返回字段（可缩小结果类型） */
  select<K extends keyof T>(...fields: K[]): QueryExecutor<T, K>;

  // 分组与过滤
  /** 按字段分组 */
  groupBy(...fields: (keyof T)[]): QueryExecutor<T, S>;
  /** 对分组结果添加过滤条件 */
  having(field: keyof T, op: string, value: unknown): QueryExecutor<T, S>;

  // 软删除控制
  /** 查询时包含已软删除的行 */
  withDeleted(): QueryExecutor<T, S>;

  // 查询执行
  /** 返回满足条件的全部行 */
  list(): Promise<Pick<T, S>[]>;
  /** 返回满足条件的第一行，若无则返回 undefined */
  get(): Promise<Pick<T, S> | undefined>;
  /** 统计满足条件的行数 */
  count(): Promise<number>;
  /** 对字段求和 */
  sum(field: keyof T): Promise<number>;
  /** 对字段求平均值 */
  avg(field: keyof T): Promise<number>;
  /** 对字段求最小值 */
  min(field: keyof T): Promise<number>;
  /** 对字段求最大值 */
  max(field: keyof T): Promise<number>;

  // 写操作
  /**
   * 插入单行。
   * @param data — 待插入的部分字段数据
   * @param options.returning — 是否返回插入后的完整行
   * @returns 若启用 returning 则返回插入行，否则 undefined
   */
  insert(data: Partial<T>, options?: { returning?: boolean }): Promise<T | undefined>;
  /**
   * 更新满足当前条件的行。
   * @param data — 待更新的字段值
   * @param options.returning — 是否返回更新后的完整行
   * @returns 若启用 returning 则返回更新行，否则 undefined
   */
  update(data: Partial<T>, options?: { returning?: boolean }): Promise<T | undefined>;
  /**
   * 删除满足当前条件的行。
   * @param options.force — 对软删除模型执行物理删除
   */
  delete(options?: { force?: boolean }): Promise<void>;
  /** 批量插入多行 */
  batchInsert(rows: Partial<T>[], fields?: string[]): Promise<void>;
  /** 强制物理删除 */
  hardDelete(): Promise<void>;
  /** 恢复被软删除的行 */
  restore(): Promise<void>;
}

/**
 * 数据库实例接口，提供模型查询、原始 SQL、事务与关闭能力。
 */
export interface Database {
  /**
   * 基于模型创建查询执行器。
   * @template T — 模型行类型
   * @param model — 模型定义
   */
  query<T>(model: ModelDefinition<T>): QueryExecutor<T>;
  /**
   * 执行原始 SQL。
   * @param text — SQL 文本
   * @param params — 可选参数数组
   */
  raw(text: string, params?: unknown[]): Promise<unknown[]>;
  /**
   * 在事务中执行函数。
   * @param fn — 接收事务数据库实例的异步函数
   * @returns 函数返回值
   */
  transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T>;
  /** 关闭数据库连接 */
  close(): Promise<void>;
}

/**
 * 为指定模型创建查询执行器，内部包装 QueryBuilder 并绑定 SQL 执行逻辑。
 * @param model — 模型定义
 * @param executor — SQL 执行器
 * @returns 链式查询执行器
 */
function createQueryExecutor<T>(
  model: ModelDefinition<T>,
  executor: SqlExecutor,
): QueryExecutor<T, keyof T> {
  const builder = createQueryBuilder<T>(model);

  function wrap<S extends keyof T>(nextBuilder: QueryBuilder<T>): QueryExecutor<T, S> {
    const qe: QueryExecutor<T, S> = {
      where(field: keyof T, op: WhereOp, value?: unknown): QueryExecutor<T, S> {
        return wrap<S>(nextBuilder.where(field, op, value));
      },
      orWhere(field: keyof T, op: WhereOp, value?: unknown): QueryExecutor<T, S> {
        return wrap<S>(nextBuilder.orWhere(field, op, value));
      },
      orderBy(field: keyof T, direction?: "asc" | "desc"): QueryExecutor<T, S> {
        return wrap<S>(nextBuilder.orderBy(field, direction));
      },
      limit(n: number): QueryExecutor<T, S> {
        return wrap<S>(nextBuilder.limit(n));
      },
      offset(n: number): QueryExecutor<T, S> {
        return wrap<S>(nextBuilder.offset(n));
      },
      select<K extends keyof T>(...fields: K[]): QueryExecutor<T, K> {
        return wrap<K>(nextBuilder.select(...fields));
      },
      groupBy(...fields: (keyof T)[]): QueryExecutor<T, S> {
        return wrap<S>(nextBuilder.groupBy(...fields));
      },
      having(field: keyof T, op: string, value: unknown): QueryExecutor<T, S> {
        return wrap<S>(nextBuilder.having(field, op, value));
      },
      withDeleted(): QueryExecutor<T, S> {
        return wrap<S>(nextBuilder.withDeleted());
      },

      async list(): Promise<Pick<T, S>[]> {
        const { text, params } = nextBuilder.toSQL();
        const rows = await executor(text, params);
        return rows as Pick<T, S>[];
      },

      async get(): Promise<Pick<T, S> | undefined> {
        const limited = nextBuilder.hasLimit() ? nextBuilder : nextBuilder.limit(1);
        const { text, params } = limited.toSQL();
        const rows = await executor(text, params);
        return (rows as Pick<T, S>[])[0];
      },

      async count(): Promise<number> {
        const countBuilder = nextBuilder
          .select("COUNT(*) as count" as keyof T)
          .clearLimit()
          .clearOffset();
        const { text, params } = countBuilder.toSQL();
        const rows = await executor(text, params);
        const first = (rows as Array<{ count: number }>)[0];
        return first?.count ?? 0;
      },

      async sum(field: keyof T): Promise<number> {
        const aggBuilder = nextBuilder.select(`SUM(${field as string}) as result` as keyof T);
        const { text, params } = aggBuilder.toSQL();
        const rows = await executor(text, params);
        const first = (rows as Array<{ result: number | null }>)[0];
        return first?.result ?? 0;
      },

      async avg(field: keyof T): Promise<number> {
        const aggBuilder = nextBuilder.select(`AVG(${field as string}) as result` as keyof T);
        const { text, params } = aggBuilder.toSQL();
        const rows = await executor(text, params);
        const first = (rows as Array<{ result: number | null }>)[0];
        return first?.result ?? 0;
      },

      async min(field: keyof T): Promise<number> {
        const aggBuilder = nextBuilder.select(`MIN(${field as string}) as result` as keyof T);
        const { text, params } = aggBuilder.toSQL();
        const rows = await executor(text, params);
        const first = (rows as Array<{ result: number | null }>)[0];
        return first?.result ?? 0;
      },

      async max(field: keyof T): Promise<number> {
        const aggBuilder = nextBuilder.select(`MAX(${field as string}) as result` as keyof T);
        const { text, params } = aggBuilder.toSQL();
        const rows = await executor(text, params);
        const first = (rows as Array<{ result: number | null }>)[0];
        return first?.result ?? 0;
      },

      async insert(data: Partial<T>, options?: { returning?: boolean }): Promise<T | undefined> {
        const insertBuilder = nextBuilder.insertData(data as Record<string, unknown>);
        let { text, params } = insertBuilder.toSQL();
        if (options?.returning) {
          text += " RETURNING *";
        }
        const rows = await executor(text, params);
        if (options?.returning) {
          return (rows as T[])[0];
        }
      },

      async update(data: Partial<T>, options?: { returning?: boolean }): Promise<T | undefined> {
        const updateBuilder = nextBuilder.updateData(data as Record<string, unknown>);
        let { text, params } = updateBuilder.toSQL();
        if (options?.returning) {
          text += " RETURNING *";
        }
        const rows = await executor(text, params);
        if (options?.returning) {
          return (rows as T[])[0];
        }
      },

      async delete(options?: { force?: boolean }): Promise<void> {
        if (options?.force && model.options.softDelete) {
          const hardBuilder = nextBuilder.hardDelete();
          const { text, params } = hardBuilder.toSQL();
          await executor(text, params);
          return;
        }
        const deleteBuilder = nextBuilder.deleteQuery();
        const { text, params } = deleteBuilder.toSQL();
        await executor(text, params);
      },

      async batchInsert(rows: Partial<T>[], fields?: string[]): Promise<void> {
        if (rows.length === 0) return;
        const actualFields = fields ?? Object.keys(rows[0]!);
        const batchBuilder = nextBuilder.batchInsert(
          rows as Record<string, unknown>[],
          actualFields,
        );
        const { text, params } = batchBuilder.toSQL();
        await executor(text, params);
      },

      async hardDelete(): Promise<void> {
        const hardBuilder = nextBuilder.hardDelete();
        const { text, params } = hardBuilder.toSQL();
        await executor(text, params);
      },

      async restore(): Promise<void> {
        const restoreBuilder = nextBuilder.restore();
        const { text, params } = restoreBuilder.toSQL();
        await executor(text, params);
      },
    };
    return qe;
  }

  return wrap<keyof T>(builder);
}

/**
 * SQL 执行器连接选项
 */
export interface SqlExecutorOptions {
  /** 最大连接数（连接池大小） */
  max?: number;
  /** 空闲超时（毫秒） */
  idle?: number;
  /** 连接超时（毫秒） */
  timeout?: number;
}

/**
 * 基于 Bun.SQL 创建原生 SQL 执行器。
 * Bun 1.2+ 的 SQL 类同时支持 PostgreSQL 与 SQLite URL。
 * @param url — 数据库连接 URL（如 "postgres://..." 或 "sqlite://..."）
 * @param options — 连接选项（max、idle、timeout）
 * @returns SQL 执行器与底层 SQL 实例（用于关闭连接）
 */
export function createSqlExecutor(
  url: string,
  options?: SqlExecutorOptions,
): { executor: SqlExecutor; close: () => Promise<void> } {
  // Bun 1.2+ 将 SQL 暴露为全局类（Bun.SQL 或 globalThis.SQL）
  // @ts-ignore - Bun.SQL is only available in Bun 1.2+ runtime
  const SQLClass: new (options: { url: string; max?: number; idle?: number; timeout?: number }) => {
    unsafe: (text: string, params?: unknown[]) => Promise<unknown>;
    close: () => void;
  } = (globalThis as any).SQL ?? (globalThis as any).Bun?.SQL;

  if (typeof SQLClass !== "function") {
    throw new Error(
      "Bun.SQL is not available. Please upgrade to Bun 1.2+. " +
        "Alternatively, provide a custom executor via config.executor.",
    );
  }

  const sql = new SQLClass({
    url,
    ...(options?.max != null ? { max: options.max } : {}),
    ...(options?.idle != null ? { idle: options.idle } : {}),
    ...(options?.timeout != null ? { timeout: options.timeout } : {}),
  });

  const executor: SqlExecutor = async (text, params) => {
    const result =
      params && params.length > 0
        ? await sql.unsafe(text, params as any[])
        : await sql.unsafe(text);

    return Array.isArray(result) ? result : [];
  };

  return {
    executor,
    async close() {
      sql.close();
    },
  };
}

/**
 * 基于 Bun.SQL 创建原生 SQL 执行器（内部使用，不含 close）。
 * @deprecated 使用 createSqlExecutor 代替
 */
function createBunSqlExecutor(url: string): SqlExecutor {
  const { executor } = createSqlExecutor(url);
  return executor;
}

/**
 * 创建数据库实例。
 * 优先使用自定义 executor，否则通过 url 自动创建 Bun.sql 连接。
 * @param config — 数据库配置
 * @returns 数据库实例
 */
export function createDatabase(config: DatabaseConfig): Database {
  let sqlClose: (() => Promise<void>) | undefined;

  const executor: SqlExecutor =
    config.executor ??
    (() => {
      if (!config.url) {
        throw new Error(
          "No SQL executor configured. Provide config.url for auto Bun.sql connection or config.executor.",
        );
      }
      const options: SqlExecutorOptions = {};
      if (config.max !== undefined) options.max = config.max;
      if (config.idle !== undefined) options.idle = config.idle;
      if (config.timeout !== undefined) options.timeout = config.timeout;
      const result = createSqlExecutor(config.url, options);
      sqlClose = result.close;
      return result.executor;
    })();

  let closed = false;

  const db: Database = {
    query<T>(model: ModelDefinition<T>): QueryExecutor<T> {
      if (closed) throw new Error("Database connection is closed");
      return createQueryExecutor(model, executor);
    },

    async raw(text: string, params?: unknown[]): Promise<unknown[]> {
      if (closed) throw new Error("Database connection is closed");
      return executor(text, params);
    },

    async transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
      if (closed) throw new Error("Database connection is closed");
      await executor("BEGIN");
      try {
        // 创建与外层共享 executor 的事务数据库实例
        const txDb = createTransactionDatabase(executor);
        const result = await fn(txDb);
        await executor("COMMIT");
        return result;
      } catch (err) {
        await executor("ROLLBACK");
        throw err;
      }
    },

    async close(): Promise<void> {
      closed = true;
      await sqlClose?.();
    },
  };

  return db;
}

/**
 * 创建事务上下文中的数据库实例。
 * 嵌套事务使用 SAVEPOINT 实现。
 * @param executor — SQL 执行器
 * @returns 事务数据库实例
 */
function createTransactionDatabase(executor: SqlExecutor): Database {
  let savepointCounter = 0;
  return {
    query<T>(model: ModelDefinition<T>): QueryExecutor<T> {
      return createQueryExecutor(model, executor);
    },
    async raw(text: string, params?: unknown[]): Promise<unknown[]> {
      return executor(text, params);
    },
    async transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
      // 嵌套事务使用 SAVEPOINT
      const savepointName = `sp_${++savepointCounter}`;
      await executor(`SAVEPOINT ${savepointName}`);
      try {
        const result = await fn(this);
        await executor(`RELEASE SAVEPOINT ${savepointName}`);
        return result;
      } catch (err) {
        await executor(`ROLLBACK TO SAVEPOINT ${savepointName}`);
        throw err;
      }
    },
    async close(): Promise<void> {
      // 事务上下文中关闭为无操作
    },
  };
}
```

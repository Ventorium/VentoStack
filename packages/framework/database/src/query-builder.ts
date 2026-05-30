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

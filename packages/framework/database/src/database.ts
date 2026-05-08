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
  where(field: keyof T, op: Exclude<WhereOp, "IS NULL" | "IS NOT NULL">, value: unknown): QueryExecutor<T, S>;
  where(field: keyof T, op: WhereOp, value?: unknown): QueryExecutor<T, S>;
  orWhere(field: keyof T, op: "IS NULL" | "IS NOT NULL"): QueryExecutor<T, S>;
  orWhere(field: keyof T, op: Exclude<WhereOp, "IS NULL" | "IS NOT NULL">, value: unknown): QueryExecutor<T, S>;
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
        const countBuilder = nextBuilder.select("COUNT(*) as count" as keyof T).clearLimit().clearOffset();
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
export function createSqlExecutor(url: string, options?: SqlExecutorOptions): { executor: SqlExecutor; close: () => Promise<void> } {
  // Bun 1.2+ 将 SQL 暴露为全局类（Bun.SQL 或 globalThis.SQL）
  // @ts-ignore - Bun.SQL is only available in Bun 1.2+ runtime
  const SQLClass: new (options: { url: string; max?: number; idle?: number; timeout?: number }) => { unsafe: (text: string, params?: unknown[]) => Promise<unknown>; close: () => void } =
    (globalThis as any).SQL ?? (globalThis as any).Bun?.SQL;

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

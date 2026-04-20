// @aeron/database - Database Manager

import type { ModelDefinition } from "./model";
import { createQueryBuilder } from "./query-builder";

export type SqlExecutor = (text: string, params?: unknown[]) => Promise<unknown[]>;

export interface DatabaseConfig {
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  url?: string;
  max?: number;
  idle?: number;
  timeout?: number;
  executor?: SqlExecutor;
}

export interface QueryExecutor<T> {
  where(field: string, op: string, value?: unknown): QueryExecutor<T>;
  orWhere(field: string, op: string, value?: unknown): QueryExecutor<T>;
  orderBy(field: string, direction?: "asc" | "desc"): QueryExecutor<T>;
  limit(n: number): QueryExecutor<T>;
  offset(n: number): QueryExecutor<T>;
  select(...fields: string[]): QueryExecutor<T>;

  groupBy(...fields: string[]): QueryExecutor<T>;
  having(field: string, op: string, value: unknown): QueryExecutor<T>;
  withDeleted(): QueryExecutor<T>;

  list(): Promise<T[]>;
  get(): Promise<T | undefined>;
  count(): Promise<number>;
  sum(field: string): Promise<number>;
  avg(field: string): Promise<number>;
  min(field: string): Promise<number>;
  max(field: string): Promise<number>;
  insert(data: Partial<T>, options?: { returning?: boolean }): Promise<T | void>;
  update(data: Partial<T>, options?: { returning?: boolean }): Promise<T | void>;
  delete(options?: { force?: boolean }): Promise<void>;
  batchInsert(rows: Partial<T>[], fields?: string[]): Promise<void>;
  hardDelete(): Promise<void>;
  restore(): Promise<void>;
}

export interface Database {
  query<T>(model: ModelDefinition<T>): QueryExecutor<T>;
  raw(text: string, params?: unknown[]): Promise<unknown[]>;
  transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

function createQueryExecutor<T>(
  model: ModelDefinition<T>,
  executor: SqlExecutor,
): QueryExecutor<T> {
  let builder = createQueryBuilder<T>(model);

  function wrap(nextBuilder: typeof builder): QueryExecutor<T> {
    const qe: QueryExecutor<T> = {
      where(field: string, op: string, value?: unknown): QueryExecutor<T> {
        return wrap(nextBuilder.where(field, op, value));
      },
      orWhere(field: string, op: string, value?: unknown): QueryExecutor<T> {
        return wrap(nextBuilder.orWhere(field, op, value));
      },
      orderBy(field: string, direction?: "asc" | "desc"): QueryExecutor<T> {
        return wrap(nextBuilder.orderBy(field, direction));
      },
      limit(n: number): QueryExecutor<T> {
        return wrap(nextBuilder.limit(n));
      },
      offset(n: number): QueryExecutor<T> {
        return wrap(nextBuilder.offset(n));
      },
      select(...fields: string[]): QueryExecutor<T> {
        return wrap(nextBuilder.select(...fields));
      },
      groupBy(...fields: string[]): QueryExecutor<T> {
        return wrap(nextBuilder.groupBy(...fields));
      },
      having(field: string, op: string, value: unknown): QueryExecutor<T> {
        return wrap(nextBuilder.having(field, op, value));
      },
      withDeleted(): QueryExecutor<T> {
        return wrap(nextBuilder.withDeleted());
      },

      async list(): Promise<T[]> {
        const { text, params } = nextBuilder.toSQL();
        const rows = await executor(text, params);
        return rows as T[];
      },

      async get(): Promise<T | undefined> {
        const limited = nextBuilder.limit(1);
        const { text, params } = limited.toSQL();
        const rows = await executor(text, params);
        return (rows as T[])[0];
      },

      async count(): Promise<number> {
        const countBuilder = nextBuilder.select("COUNT(*) as count");
        const { text, params } = countBuilder.toSQL();
        const rows = await executor(text, params);
        const first = (rows as Array<{ count: number }>)[0];
        return first?.count ?? 0;
      },

      async sum(field: string): Promise<number> {
        const aggBuilder = nextBuilder.select(`SUM(${field}) as result`);
        const { text, params } = aggBuilder.toSQL();
        const rows = await executor(text, params);
        const first = (rows as Array<{ result: number | null }>)[0];
        return first?.result ?? 0;
      },

      async avg(field: string): Promise<number> {
        const aggBuilder = nextBuilder.select(`AVG(${field}) as result`);
        const { text, params } = aggBuilder.toSQL();
        const rows = await executor(text, params);
        const first = (rows as Array<{ result: number | null }>)[0];
        return first?.result ?? 0;
      },

      async min(field: string): Promise<number> {
        const aggBuilder = nextBuilder.select(`MIN(${field}) as result`);
        const { text, params } = aggBuilder.toSQL();
        const rows = await executor(text, params);
        const first = (rows as Array<{ result: number | null }>)[0];
        return first?.result ?? 0;
      },

      async max(field: string): Promise<number> {
        const aggBuilder = nextBuilder.select(`MAX(${field}) as result`);
        const { text, params } = aggBuilder.toSQL();
        const rows = await executor(text, params);
        const first = (rows as Array<{ result: number | null }>)[0];
        return first?.result ?? 0;
      },

      async insert(data: Partial<T>, options?: { returning?: boolean }): Promise<T | void> {
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

      async update(data: Partial<T>, options?: { returning?: boolean }): Promise<T | void> {
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

  return wrap(builder);
}

export function createDatabase(config: DatabaseConfig): Database {
  const executor: SqlExecutor = config.executor ?? (() => {
    throw new Error("No SQL executor configured. Provide config.executor or connect to a real database.");
  });

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
        // Create a transactional database that shares the same executor
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
    },
  };

  return db;
}

function createTransactionDatabase(executor: SqlExecutor): Database {
  return {
    query<T>(model: ModelDefinition<T>): QueryExecutor<T> {
      return createQueryExecutor(model, executor);
    },
    async raw(text: string, params?: unknown[]): Promise<unknown[]> {
      return executor(text, params);
    },
    async transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
      // Nested transaction uses SAVEPOINT
      const savepointName = `sp_${Date.now()}`;
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
      // No-op in transaction context
    },
  };
}

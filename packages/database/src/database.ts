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
  orderBy(field: string, direction?: "asc" | "desc"): QueryExecutor<T>;
  limit(n: number): QueryExecutor<T>;
  offset(n: number): QueryExecutor<T>;
  select(...fields: string[]): QueryExecutor<T>;

  list(): Promise<T[]>;
  get(): Promise<T | undefined>;
  count(): Promise<number>;
  insert(data: Partial<T>, options?: { returning?: boolean }): Promise<T | void>;
  update(data: Partial<T>, options?: { returning?: boolean }): Promise<T | void>;
  delete(options?: { force?: boolean }): Promise<void>;
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
          // Force delete on soft-delete model: build a hard delete
          const { params } = nextBuilder.toSQL();
          // We need to rebuild with soft delete disabled
          const hardBuilder = nextBuilder.deleteQuery();
          // Override: build raw DELETE ignoring softDelete
          const selectSQL = nextBuilder.toSQL();
          // Extract where conditions from select SQL and build DELETE
          let deleteText = `DELETE FROM ${model.tableName}`;
          const whereIdx = selectSQL.text.indexOf(" WHERE ");
          if (whereIdx !== -1) {
            // Get where clause but strip ORDER BY/LIMIT/OFFSET
            let whereClause = selectSQL.text.substring(whereIdx);
            const orderIdx = whereClause.indexOf(" ORDER BY ");
            if (orderIdx !== -1) {
              whereClause = whereClause.substring(0, orderIdx);
            }
            const limitIdx = whereClause.indexOf(" LIMIT ");
            if (limitIdx !== -1) {
              whereClause = whereClause.substring(0, limitIdx);
            }
            deleteText += whereClause;
          }
          // Filter params (only where params, not limit/offset)
          const whereParams = selectSQL.params.slice(0, selectSQL.params.length);
          // Remove limit/offset params if present
          const sql = nextBuilder.toSQL();
          const whereParamCount = (sql.text.match(/\$/g) ?? []).length;
          await executor(deleteText, selectSQL.params.slice(0, countWhereParams(selectSQL.text)));
          return;
        }
        const deleteBuilder = nextBuilder.deleteQuery();
        const { text, params } = deleteBuilder.toSQL();
        await executor(text, params);
      },
    };
    return qe;
  }

  return wrap(builder);
}

function countWhereParams(text: string): number {
  // Count $N placeholders only in WHERE clause
  const whereIdx = text.indexOf(" WHERE ");
  if (whereIdx === -1) return 0;
  let whereClause = text.substring(whereIdx);
  const orderIdx = whereClause.indexOf(" ORDER BY ");
  if (orderIdx !== -1) whereClause = whereClause.substring(0, orderIdx);
  const limitIdx = whereClause.indexOf(" LIMIT ");
  if (limitIdx !== -1) whereClause = whereClause.substring(0, limitIdx);
  const matches = whereClause.match(/\$\d+/g);
  return matches ? matches.length : 0;
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

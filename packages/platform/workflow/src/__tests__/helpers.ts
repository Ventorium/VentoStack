/**
 * @ventostack/workflow - 测试辅助工具
 */

import { mock } from "bun:test";

/** 为数组附加 rowCount 属性，兼容 db.raw() 返回值 */
function withRowCount(rows: unknown[]): unknown[] {
  Object.defineProperty(rows, "rowCount", { value: rows.length, writable: true, enumerable: false, configurable: true });
  return rows;
}

/** 创建 Mock SqlExecutor */
export function createMockExecutor() {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const results: Map<string, unknown[]> = new Map();

  const executor = mock(async (text: string, params?: unknown[]): Promise<unknown[]> => {
    calls.push({ text, params });
    // Try exact match first
    for (const [pattern, result] of results) {
      if (text.includes(pattern)) return result;
    }
    // Flexible match: for COUNT/WHERE queries, match on table name from patterns
    const fromMatch = text.match(/FROM\s+(\w+)/i);
    if (fromMatch) {
      const tableName = fromMatch[1];
      for (const [pattern, result] of results) {
        if (pattern.includes(tableName) && !pattern.includes("WHERE")) {
          if (
            text.startsWith("SELECT COUNT") ||
            (!text.includes("WHERE") && !text.includes("LIMIT"))
          ) {
            return result;
          }
        }
      }
      // WHERE-level match: strip params for flexible matching
      const stripped = text
        .replace(/\$\d+/g, "?")
        .replace(/\s+LIMIT\s+\d+/gi, "")
        .replace(/\s+OFFSET\s+\d+/gi, "")
        .trim();
      for (const [pattern, result] of results) {
        const patternStripped = pattern.replace(/\$\d+/g, "?");
        if (stripped.includes(patternStripped) || patternStripped.includes(stripped)) {
          return result;
        }
      }
    }
    return [];
  });

  return { executor, calls, results };
}

/** 创建 Mock JWTManager */
export function createMockJWTManager() {
  return {
    sign: mock(
      async (payload: any) =>
        Buffer.from(JSON.stringify(payload)).toString("base64url") + ".mocksig",
    ),
    verify: mock(async (token: string) => {
      const payload = JSON.parse(Buffer.from(token.split(".")[0]!, "base64url").toString());
      return payload;
    }),
    decode: mock((token: string) => {
      try {
        return JSON.parse(Buffer.from(token.split(".")[0]!, "base64url").toString());
      } catch {
        return null;
      }
    }),
  };
}

/**
 * 创建 Mock Database
 */
export function createMockDatabase(mockExecutor: ReturnType<typeof createMockExecutor>) {
  const { executor } = mockExecutor;

  /** 将 executor 结果包装为带 rowCount 的 MockResult */
  async function execRaw(text: string, params?: unknown[]): Promise<unknown[]> {
    const rows = await executor(text, params);
    return withRowCount(rows);
  }

  function createBuilder() {
    const state: {
      wheres: Array<{ field: string; op: string; value: unknown }>;
      selects: string[];
      tableName: string;
      orderByField: string | null;
      orderByDir: string;
      limitVal: number | null;
      offsetVal: number | null;
      isDeleted: boolean;
      softDelete: boolean;
    } = {
      wheres: [],
      selects: [],
      tableName: "",
      orderByField: null,
      orderByDir: "ASC",
      limitVal: null,
      offsetVal: null,
      isDeleted: false,
      softDelete: false,
    };

    function buildConditions(params: unknown[]): string[] {
      const conditions: string[] = [];
      for (const w of state.wheres) {
        if (w.op === "IN" && Array.isArray(w.value)) {
          const placeholders = w.value.map((v) => {
            params.push(v);
            return `$${params.length}`;
          });
          conditions.push(`${w.field} IN (${placeholders.join(", ")})`);
        } else {
          params.push(w.value);
          conditions.push(`${w.field} ${w.op} $${params.length}`);
        }
      }
      if (state.softDelete && !state.isDeleted) {
        conditions.push("deleted_at IS NULL");
      }
      return conditions;
    }

    const builder: any = {
      _setState(table: string, sd: boolean) {
        state.tableName = table;
        state.softDelete = sd;
        return builder;
      },
      where(field: string, op: string, value?: unknown) {
        state.wheres.push({ field, op, value });
        return builder;
      },
      select(...fields: string[]) {
        state.selects = fields;
        return builder;
      },
      orderBy(field: string, dir: string) {
        state.orderByField = field;
        state.orderByDir = dir;
        return builder;
      },
      limit(n: number) {
        state.limitVal = n;
        return builder;
      },
      offset(n: number) {
        state.offsetVal = n;
        return builder;
      },
      withDeleted() {
        state.isDeleted = true;
        return builder;
      },
      async get() {
        let sql = `SELECT * FROM ${state.tableName}`;
        const params: unknown[] = [];
        const conditions = buildConditions(params);
        if (conditions.length > 0) sql += ` WHERE ${conditions.join(" AND ")}`;
        sql += " LIMIT 1";
        const rows = await executor(sql, params);
        return rows.length > 0 ? rows[0] : null;
      },
      async list() {
        let sql = `SELECT * FROM ${state.tableName}`;
        const params: unknown[] = [];
        const conditions = buildConditions(params);
        if (conditions.length > 0) sql += ` WHERE ${conditions.join(" AND ")}`;
        if (state.orderByField) sql += ` ORDER BY ${state.orderByField} ${state.orderByDir}`;
        if (state.limitVal !== null) sql += ` LIMIT ${state.limitVal}`;
        if (state.offsetVal !== null) sql += ` OFFSET ${state.offsetVal}`;
        return executor(sql, params);
      },
      async count() {
        let sql = `SELECT COUNT(*) as count FROM ${state.tableName}`;
        const params: unknown[] = [];
        const conditions = buildConditions(params);
        if (conditions.length > 0) sql += ` WHERE ${conditions.join(" AND ")}`;
        const rows = (await executor(sql, params)) as any[];
        if (rows.length === 0) return 0;
        const first = rows[0];
        if (first?.count !== undefined) return Number(first.count);
        if (first?.total !== undefined) return Number(first.total);
        if (first?.cnt !== undefined) return Number(first.cnt);
        return rows.length;
      },
      async insert(data: Record<string, unknown>) {
        const cols = Object.keys(data);
        const vals = Object.values(data);
        const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
        const sql = `INSERT INTO ${state.tableName} (${cols.join(", ")}) VALUES (${placeholders})`;
        await executor(sql, vals);
      },
      async batchInsert(rows: Record<string, unknown>[]) {
        if (rows.length === 0) return;
        const cols = Object.keys(rows[0]!);
        const allPlaceholders: string[] = [];
        const allVals: unknown[] = [];
        for (const data of rows) {
          const vals = cols.map((c) => data[c]);
          const start = allVals.length;
          allPlaceholders.push(`(${vals.map((_, i) => `$${start + i + 1}`).join(", ")})`);
          allVals.push(...vals);
        }
        const sql = `INSERT INTO ${state.tableName} (${cols.join(", ")}) VALUES ${allPlaceholders.join(", ")}`;
        await executor(sql, allVals);
      },
      async update(data: Record<string, unknown>) {
        const entries = Object.entries(data);
        const setParts: string[] = [];
        const params: unknown[] = [];
        for (const [key, val] of entries) {
          params.push(val);
          setParts.push(`${key} = $${params.length}`);
        }
        const conditions = buildConditions(params);
        let sql = `UPDATE ${state.tableName} SET ${setParts.join(", ")}`;
        if (conditions.length > 0) sql += ` WHERE ${conditions.join(" AND ")}`;
        await executor(sql, params);
      },
      async hardDelete() {
        const params: unknown[] = [];
        const conditions = buildConditions(params);
        let sql = `DELETE FROM ${state.tableName}`;
        if (conditions.length > 0) sql += ` WHERE ${conditions.join(" AND ")}`;
        await executor(sql, params);
      },
      async delete() {
        const params: unknown[] = [];
        const conditions = buildConditions(params);
        let sql = `UPDATE ${state.tableName} SET deleted_at = NOW()`;
        if (conditions.length > 0) sql += ` WHERE ${conditions.join(" AND ")}`;
        await executor(sql, params);
      },
    };
    return builder;
  }

  const modelMeta = new Map<string, { tableName: string; softDelete: boolean }>();

  function registerModel(modelOrName: any, tableName?: string, softDelete = false) {
    if (typeof modelOrName === "string") {
      modelMeta.set(modelOrName, { tableName: tableName ?? modelOrName, softDelete });
    } else if (modelOrName?.tableName) {
      modelMeta.set(modelOrName.tableName, {
        tableName: modelOrName.tableName,
        softDelete: modelOrName?.options?.softDelete ?? false,
      });
    }
  }

  const db = {
    query(model: any) {
      const tableName = model?.tableName ?? "unknown";
      const meta = modelMeta.get(tableName) ?? {
        tableName,
        softDelete: model?.options?.softDelete ?? false,
      };
      return createBuilder()._setState(meta.tableName, meta.softDelete);
    },
    raw: mock(async (text: string, params?: unknown[]) => {
      return execRaw(text, params);
    }),
    async transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
      return fn(db);
    },
    async close() {},
  };

  return { db: db as any, registerModel };
}

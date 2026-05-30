/**
 * @ventostack/notify - 测试辅助工具
 */

import { mock } from "bun:test";
import type { NotifyChannel } from "../services/notification";

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
          // Table-level match (no WHERE clause in pattern) - return result for COUNT/list queries
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

/** 创建 Mock 通知通道 */
export function createMockChannel(
  name: string,
): NotifyChannel & { _sent: Array<{ to: string; title: string; content: string }> } {
  const sent: Array<{ to: string; title: string; content: string }> = [];
  return {
    _sent: sent,
    name,
    send: mock(async (params) => {
      sent.push(params);
      return { success: true };
    }),
  };
}

/** 创建失败的 Mock 通知通道 */
export function createFailingChannel(name: string): NotifyChannel {
  return {
    name,
    send: mock(async () => ({ success: false, error: "Channel error" })),
  };
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
 *
 * 拦截 db.query(Model) 调用，在 query builder 的 get()/list()/count() 阶段
 * 根据 SQL 模式匹配返回预设结果（与 createMockExecutor 的 results Map 兼容）。
 *
 * 同时支持 db.raw() 直接调用 mock executor。
 */
export function createMockDatabase(mockExecutor: ReturnType<typeof createMockExecutor>) {
  const { executor } = mockExecutor;

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
        // Handle { count: N }, { total: N }, or { cnt: N } patterns
        const first = rows[0];
        if (first?.count !== undefined) return Number(first.count);
        if (first?.total !== undefined) return Number(first.total);
        if (first?.cnt !== undefined) return Number(first.cnt);
        // Fallback: return row count
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
      return executor(text, params);
    }),
    async transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
      return fn(db);
    },
    async close() {},
  };

  return { db: db as any, registerModel };
}

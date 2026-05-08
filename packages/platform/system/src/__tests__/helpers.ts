/**
 * @ventostack/system - 测试辅助工具
 */

import { mock } from "bun:test";
import { createCache, createMemoryAdapter } from "@ventostack/cache";
import type { Database } from "@ventostack/database";

/** 创建 Mock SqlExecutor */
export function createMockExecutor() {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const results: Map<string, unknown[]> = new Map();

  const executor = mock(async (text: string, params?: unknown[]): Promise<unknown[]> => {
    calls.push({ text, params });
    for (const [pattern, result] of results) {
      if (text.includes(pattern)) return result;
    }
    return [];
  });

  return { executor, calls, results };
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
  const { executor, calls } = mockExecutor;

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
      softDelete: true,
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
        const cols = state.selects.length > 0 ? state.selects.join(", ") : "*";
        let sql = `SELECT ${cols} FROM ${state.tableName}`;
        const params: unknown[] = [];
        const conditions = buildConditions(params);
        if (conditions.length > 0) sql += ` WHERE ${conditions.join(" AND ")}`;
        sql += " LIMIT 1";

        const rows = await executor(sql, params);
        return rows.length > 0 ? rows[0] : null;
      },
      async list() {
        const cols = state.selects.length > 0 ? state.selects.join(", ") : "*";
        let sql = `SELECT ${cols} FROM ${state.tableName}`;
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

        const rows = await executor(sql, params);
        return Number((rows as any[])[0]?.count ?? 0);
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
    // Support both registerModel(UserModel) and registerModel("UserModel", "sys_user")
    if (typeof modelOrName === "string") {
      modelMeta.set(modelOrName, { tableName: tableName ?? modelOrName, softDelete });
    } else if (modelOrName?.tableName) {
      modelMeta.set(modelOrName.tableName, { tableName: modelOrName.tableName, softDelete: modelOrName.options?.softDelete ?? softDelete });
    }
  }

  const db = {
    query(model: any) {
      // Try to get table name from model object (defineModel returns { tableName, ... })
      const tableName = model?.tableName ?? "unknown";
      const meta = modelMeta.get(tableName) ?? { tableName, softDelete: model?.options?.softDelete ?? false };
      return createBuilder()._setState(meta.tableName, meta.softDelete);
    },
    raw: mock(async (text: string, params?: unknown[]) => {
      return executor(text, params);
    }),
  };

  return { db: db as unknown as Database, registerModel, calls };
}

/** 创建测试用 Cache */
export function createTestCache() {
  return createCache(createMemoryAdapter());
}

/** 创建 Mock JWTManager */
export function createMockJWTManager() {
  return {
    sign: mock(async (payload: any) =>
      Buffer.from(JSON.stringify(payload)).toString("base64url") + ".mocksig"
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

/** 创建 Mock PasswordHasher */
export function createMockPasswordHasher() {
  return {
    hash: mock(async (pwd: string) => `hashed_${pwd}`),
    verify: mock(async (pwd: string, hash: string) => hash === `hashed_${pwd}`),
  };
}

/** 创建 Mock TOTPManager */
export function createMockTOTPManager() {
  return {
    generateSecret: mock(() => "JBSWY3DPEHPK3PXP"),
    generateURI: mock((secret: string, issuer: string, account: string) =>
      `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}`
    ),
    generate: mock(async () => "123456"),
    verify: mock(async () => true),
    verifyAndConsume: mock(async () => true),
  };
}

/** 创建 Mock AuthSessionManager */
export function createMockAuthSessionManager() {
  return {
    login: mock(async () => ({
      sessionId: "sess-1",
      accessToken: "at-1",
      refreshToken: "rt-1",
      expiresIn: 900,
      refreshExpiresIn: 604800,
    })),
    logout: mock(async () => {}),
    forceLogout: mock(async () => ({ sessions: 1, devices: 1 })),
    refreshTokens: mock(async () => ({
      accessToken: "at-2",
      refreshToken: "rt-2",
      expiresIn: 900,
      refreshExpiresIn: 604800,
    })),
  };
}

/** 创建 Mock RBAC */
export function createMockRBAC() {
  const roles = new Map<string, Set<string>>();
  return {
    addRole: mock((role: any) => { roles.set(role.name ?? role, new Set()); }),
    removeRole: mock((name: string) => { roles.delete(name); }),
    getRole: mock((name: string) => roles.has(name) ? { name, permissions: [] } : undefined),
    hasPermission: mock((roleName: string, resource: string, action: string) => {
      const perms = roles.get(roleName);
      return perms ? perms.has(`${resource}:${action}`) : false;
    }),
    can: mock((roleNames: string[], resource: string, action: string) =>
      roleNames.some(r => roles.get(r)?.has(`${resource}:${action}`))
    ),
    grantPermission: mock((roleName: string, resource: string, action: string) => {
      const perms = roles.get(roleName);
      if (perms) perms.add(`${resource}:${action}`);
    }),
    listRoles: mock(() => []),
    _roles: roles,
  };
}

/** 创建 Mock RowFilter */
export function createMockRowFilter() {
  return {
    addRule: mock(() => {}),
    getFilters: mock(() => []),
    getRules: mock(() => []),
    buildWhereClause: mock(() => ""),
  };
}

/** 创建 Mock AuditStore */
export function createMockAuditStore() {
  const entries: any[] = [];
  return {
    append: mock(async (entry: any) => {
      const full = { id: `audit-${entries.length}`, timestamp: Date.now(), hash: "h", ...entry };
      entries.push(full);
      return full;
    }),
    query: mock(async () => entries),
    verify: mock(async () => ({ valid: true })),
    _entries: entries,
  };
}

/** 创建 Mock EventBus */
export function createMockEventBus() {
  return {
    on: mock(() => () => {}),
    once: mock(() => () => {}),
    emit: mock(async () => {}),
    off: mock(() => {}),
    removeAll: mock(() => {}),
  };
}

/** 创建 Mock ConfigService */
export function createMockConfigService(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    sys_login_max_attempts: "5",
    sys_login_lock_minutes: "15",
    sys_password_expire_days: "-1",
    sys_mfa_enabled: "false",
    sys_mfa_force: "false",
    sys_password_min_length: "6",
    sys_password_complexity: "low",
    ...overrides,
  };
  return {
    getValue: mock(async (key: string) => defaults[key] ?? null),
    setValue: mock(async (key: string, value: string) => { defaults[key] = value; }),
    create: mock(async () => {}),
    update: mock(async () => {}),
    delete: mock(async () => {}),
    list: mock(async () => []),
    _defaults: defaults,
  };
}

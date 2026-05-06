/**
 * @ventostack/system - 测试辅助工具
 */

import { mock } from "bun:test";
import { createCache, createMemoryAdapter } from "@ventostack/cache";

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

/**
 * @ventostack/ai-trace - 测试辅助工具
 */

import { mock } from "bun:test";

/** 创建 Mock SqlExecutor（SQL 模式匹配返回预设结果） */
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

/** 创建 Mock Database（db.raw 直接走 mock executor） */
export function createMockDatabase(mockExecutor: ReturnType<typeof createMockExecutor>) {
  const { executor } = mockExecutor;
  const db = {
    raw: mock(async (text: string, params?: unknown[]) => executor(text, params)),
    async transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      return fn(db);
    },
    async close() {},
  };
  return { db: db as never, registerModel: (_model: unknown, _table?: string) => {} };
}

/** 创建 Mock JWTManager（verify 直接 base64 解码首段） */
export function createMockJWTManager() {
  return {
    sign: mock(
      async (payload: unknown) =>
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

/** 创建 Mock RBAC */
export function createMockRBAC() {
  const roles = new Map<string, Set<string>>();
  return {
    hasPermission: mock((roleName: string, resource: string, action: string) => {
      const perms = roles.get(roleName);
      return perms ? perms.has(`${resource}:${action}`) : false;
    }),
    can: mock((roleNames: string[], resource: string, action: string) =>
      roleNames.some((r) => roles.get(r)?.has(`${resource}:${action}`)),
    ),
    grantPermission: mock((roleName: string, resource: string, action: string) => {
      let perms = roles.get(roleName);
      if (!perms) {
        perms = new Set();
        roles.set(roleName, perms);
      }
      perms.add(`${resource}:${action}`);
    }),
    listRoles: mock(() => []),
  };
}

/** 构造携带用户信息的 mock token（配合 MockJWTManager.verify） */
export function buildTestToken(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url") + ".mocksig";
}

import { describe, expect, mock, test } from 'bun:test';
import type { AuthUser, SessionManager } from '@ventostack/auth';
import type { Context, Middleware } from '@ventostack/core';
import { createLiveSystemAuthMiddleware } from '../middlewares/live-auth';
import { createMockDatabase, createMockExecutor } from './helpers';

function setup(options?: { session?: boolean; status?: number; blacklisted?: boolean }) {
  const mockExec = createMockExecutor();
  const { db, registerModel } = createMockDatabase(mockExec);
  registerModel('sys_user', 'sys_user', true);
  registerModel('sys_user_role', 'sys_user_role', false);
  registerModel('sys_role', 'sys_role', true);
  mockExec.results.set('SELECT status, blacklisted FROM sys_user', [
    { status: options?.status ?? 1, blacklisted: options?.blacklisted ?? false },
  ]);
  mockExec.results.set('SELECT role_id FROM sys_user_role', [{ role_id: 'r-editor' }]);
  mockExec.results.set('SELECT code FROM sys_role', [{ code: 'editor' }]);

  const tokenAuthMiddleware: Middleware = async (ctx, next) => {
    ctx.user = {
      id: 'u1',
      username: 'alice',
      roles: ['admin'],
      sessionId: 's1',
    } satisfies AuthUser;
    return next();
  };
  const sessionManager = {
    get: mock(async () =>
      options?.session === false
        ? null
        : { id: 's1', data: { userId: 'u1' }, expiresAt: Date.now() + 1_000 },
    ),
  } as unknown as SessionManager;
  const middleware = createLiveSystemAuthMiddleware({ tokenAuthMiddleware, sessionManager, db });
  const ctx = { request: new Request('http://localhost') } as Context;
  return { middleware, ctx };
}

describe('createLiveSystemAuthMiddleware', () => {
  test('使用数据库实时角色覆盖 JWT 中残留的 admin', async () => {
    const s = setup();
    let roles: string[] = [];
    const response = await s.middleware(s.ctx, async () => {
      roles = (s.ctx.user as AuthUser).roles;
      return new Response(null, { status: 204 });
    });
    expect(response.status).toBe(204);
    expect(roles).toEqual(['editor']);
  });

  test('forceLogout 后服务端会话不存在则拒绝旧 access token', async () => {
    const s = setup({ session: false });
    const response = await s.middleware(s.ctx, async () => new Response(null, { status: 204 }));
    expect(response.status).toBe(401);
  });

  test('停用账号立即拒绝旧 access token', async () => {
    const s = setup({ status: 0 });
    const response = await s.middleware(s.ctx, async () => new Response(null, { status: 204 }));
    expect(response.status).toBe(401);
  });
});

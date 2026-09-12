/**
 * @ventostack/system - UserService 测试
 */

import { describe, expect, test } from 'bun:test';
import { createAuthMiddleware, createPermMiddleware } from '@ventostack/auth';
import { createDatabase } from '@ventostack/database';
import { createUserRoutes } from '../routes/user';
import { createUserService } from '../services/user';
import {
  createMockConfigService,
  createMockDatabase,
  createMockExecutor,
  createMockJWTManager,
  createMockPasswordHasher,
  createMockRBAC,
  createTestCache,
} from './helpers';

const TEST_ACTOR = { id: 'admin-user', username: 'admin', roles: ['admin'] };
const allowRoleGrants = { assertCanAssignRoles: async () => {} };

function setup(configOverrides: Record<string, string> = {}) {
  const mockExec = createMockExecutor();
  const { db, registerModel, calls } = createMockDatabase(mockExec);
  registerModel('sys_user', 'sys_user', true);
  registerModel('sys_user_role', 'sys_user_role', false);
  registerModel('sys_role', 'sys_role', true);
  const cache = createTestCache();
  const passwordHasher = createMockPasswordHasher();
  const configService = createMockConfigService(configOverrides);
  const userService = createUserService({
    db,
    passwordHasher,
    cache,
    configService,
    governance: allowRoleGrants,
  });
  return {
    userService,
    executor: mockExec.executor,
    calls,
    results: mockExec.results,
    passwordHasher,
    configService,
  };
}

describe('UserService', () => {
  test('create user inserts with hashed password', async () => {
    const s = setup();
    s.results.set('INSERT', [{ id: 'u-new' }]);
    const result = await s.userService.create({
      username: 'alice',
      password: 'pass123',
      nickname: 'Alice',
    });
    expect(result.id).toBeTruthy();
    expect(typeof result.id).toBe('string');
    expect(s.passwordHasher.hash).toHaveBeenCalledWith('pass123');
    expect(s.calls.length).toBeGreaterThan(0);
    expect(s.calls.some((call) => call.text.includes('INSERT INTO sys_user'))).toBe(true);
  });

  test('create user uses default password from config when not provided', async () => {
    const s = setup();
    s.results.set('INSERT', [{ id: 'u-new' }]);
    await s.userService.create({
      username: 'alice',
      password: '',
    });
    // Should have used config default "123456"
    expect(s.passwordHasher.hash).toHaveBeenCalledWith('123456');
  });

  test('update user executes UPDATE', async () => {
    const s = setup();
    await s.userService.update('u1', { nickname: 'Bob' });
    expect(s.calls.some((c) => c.text.includes('UPDATE') || c.text.includes('update'))).toBe(true);
  });

  test('create user persists roleIds to sys_user_role', async () => {
    const s = setup();
    // sys_user insert
    s.results.set('INSERT', [{ id: 'u-new' }]);
    // findInvalidRoleIds 校验角色存在
    s.results.set('sys_role WHERE id IN', [{ id: 'r1' }, { id: 'r2' }]);
    const result = await s.userService.create({
      username: 'alice',
      password: 'pass123',
      roleIds: ['r1', 'r2'],
      actor: TEST_ACTOR,
    });
    expect(result.id).toBeTruthy();
    const deleteCall = s.calls.find((c) => c.text.includes('DELETE FROM sys_user_role'));
    const insertCall = s.calls.find((c) => c.text.includes('INSERT INTO sys_user_role'));
    expect(deleteCall?.params).toEqual([result.id]);
    expect(insertCall?.params).toEqual([result.id, 'r1', result.id, 'r2']);
  });

  test('create user rejects invalid roleIds', async () => {
    const s = setup();
    s.results.set('INSERT', [{ id: 'u-new' }]);
    // findInvalidRoleIds 只返回 r1，r-bad 不存在
    s.results.set('sys_role WHERE id IN', [{ id: 'r1' }]);
    await expect(
      s.userService.create({
        username: 'alice',
        password: 'pass123',
        roleIds: ['r1', 'r-bad'],
        actor: TEST_ACTOR,
      }),
    ).rejects.toThrow('角色不存在或已停用');
  });

  test('service rejects role assignment without an authenticated grant actor', async () => {
    const s = setup();
    await expect(
      s.userService.create({ username: 'alice', password: 'pass123', roleIds: ['r1'] }),
    ).rejects.toThrow('分配角色必须提供授权操作者');
  });

  test('update user atomically replaces roleIds with ORM operations', async () => {
    const s = setup();
    s.results.set('sys_role WHERE id IN', [{ id: 'r9' }]);
    await s.userService.update('u1', { roleIds: ['r9'], actor: TEST_ACTOR });
    const deleteCall = s.calls.find((c) => c.text.includes('DELETE FROM sys_user_role'));
    const insertCall = s.calls.find((c) => c.text.includes('INSERT INTO sys_user_role'));
    expect(deleteCall?.params).toEqual(['u1']);
    expect(insertCall?.params).toEqual(['u1', 'r9']);
  });

  test('update user with empty roleIds clears roles', async () => {
    const s = setup();
    await s.userService.update('u1', { roleIds: [], actor: TEST_ACTOR });
    const roleCall = s.calls.find((c) => c.text.includes('DELETE FROM sys_user_role'));
    expect(roleCall).toBeDefined();
    expect(roleCall!.params).toEqual(['u1']);
  });

  test('getById returns roles list', async () => {
    const s = setup();
    // 用户基础查询：用 WHERE id 精确匹配（FROM sys_user 会误匹配 sys_user_role）
    s.results.set('sys_user WHERE id', [
      {
        id: 'u1',
        username: 'admin',
        nickname: 'Admin',
        status: 1,
        email: 'a@b.com',
        dept_id: null,
        mfa_enabled: false,
        remark: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
    // getUserRoles 查询（sys_user_role JOIN sys_role）
    s.results.set('sys_user_role', [{ user_id: 'u1', id: 'r1', name: '管理员', code: 'admin' }]);
    const user = await s.userService.getById('u1');
    expect(user).not.toBeNull();
    expect(user!.roles).toEqual([{ id: 'r1', name: '管理员', code: 'admin' }]);
  });

  test('delete user performs soft delete', async () => {
    const s = setup();
    await s.userService.delete('u1');
    expect(s.calls.some((c) => c.text.includes('UPDATE') || c.text.includes('DELETE'))).toBe(true);
  });

  test('getById returns user detail', async () => {
    const s = setup();
    s.results.set('SELECT', [
      {
        id: 'u1',
        username: 'admin',
        nickname: 'Admin',
        status: 1,
        email: 'a@b.com',
      },
    ]);
    const user = await s.userService.getById('u1');
    expect(user).not.toBeNull();
    expect(user!.username).toBe('admin');
  });

  test('getById returns null for non-existent user', async () => {
    const s = setup();
    const user = await s.userService.getById('nonexistent');
    expect(user).toBeNull();
  });

  test('list returns paginated results', async () => {
    const s = setup();
    s.results.set('COUNT', [{ count: 5 }]);
    s.results.set('SELECT', [
      { id: 'u1', username: 'admin', status: 1 },
      { id: 'u2', username: 'user', status: 1 },
    ]);
    const result = await s.userService.list({ page: 1, pageSize: 10 });
    expect(result.items.length).toBe(2);
    expect(result.total).toBe(5);
  });

  test('resetPassword hashes new password', async () => {
    const s = setup();
    await s.userService.resetPassword('u1', 'newpass');
    expect(s.passwordHasher.hash).toHaveBeenCalledWith('newpass');
  });

  test('resetPassword rejects weak password based on config', async () => {
    const s = setup({ sys_password_min_length: '8' });
    await expect(s.userService.resetPassword('u1', 'short')).rejects.toThrow();
  });

  test('updateStatus changes user status', async () => {
    const s = setup();
    await s.userService.updateStatus('u1', 0);
    expect(s.calls.some((c) => c.text.includes('UPDATE') || c.text.includes('status'))).toBe(true);
  });

  test('list with deptId __none__ filters users without department', async () => {
    const s = setup();
    s.results.set('COUNT', [{ count: 1 }]);
    s.results.set('SELECT', [{ id: 'u1', username: 'orphan', status: 1 }]);
    const result = await s.userService.list({ page: 1, pageSize: 10, deptId: '__none__' });
    expect(result.items.length).toBe(1);
    expect(s.calls.some((c) => c.text.includes('IS') || c.text.includes('NULL'))).toBe(true);
  });

  test('list without deptId returns all users', async () => {
    const s = setup();
    s.results.set('COUNT', [{ count: 3 }]);
    s.results.set('SELECT', [
      { id: 'u1', username: 'admin', status: 1 },
      { id: 'u2', username: 'user', status: 1 },
    ]);
    const result = await s.userService.list({ page: 1, pageSize: 10 });
    expect(result.total).toBe(3);
    // 不传 deptId 时不应有 dept_id 相关的 WHERE 条件
    const selectCalls = s.calls.filter((c) => c.text.startsWith('SELECT'));
    expect(
      selectCalls.every((c) => !c.text.includes('dept_id IS') && !c.text.includes('dept_id IN')),
    ).toBe(true);
  });

  test('list applies department and self data scope as a union', async () => {
    const s = setup();
    s.results.set('COUNT', [{ count: 0 }]);
    await s.userService.list({
      page: 1,
      pageSize: 10,
      dataScope: { all: false, departmentIds: ['d1', 'd2'], self: true, userId: 'u1' },
    });
    const selects = s.calls.filter((call) => call.text.includes('FROM sys_user'));
    expect(
      selects.some((call) => call.text.includes('dept_id IN') && call.text.includes('OR id =')),
    ).toBe(true);
  });

  test('real ORM preserves parentheses around department-or-self scope', async () => {
    const sql: string[] = [];
    const db = createDatabase({
      executor: async (text) => {
        sql.push(text);
        return [];
      },
    });
    const userService = createUserService({
      db,
      passwordHasher: createMockPasswordHasher(),
      cache: createTestCache(),
      configService: createMockConfigService(),
      governance: allowRoleGrants,
    });
    await userService.list({
      page: 1,
      pageSize: 10,
      dataScope: { all: false, departmentIds: ['d1', 'd2'], self: true, userId: 'u1' },
    });
    expect(sql.some((text) => /\(dept_id IN \([^)]*\) OR id = \$\d+\)/.test(text))).toBe(true);
  });

  test('list fails closed when resolved data scope is empty', async () => {
    const s = setup();
    await s.userService.list({
      page: 1,
      pageSize: 10,
      dataScope: { all: false, departmentIds: [], self: false, userId: 'u1' },
    });
    expect(s.calls.some((call) => call.params?.includes('__data_scope_denied__'))).toBe(true);
  });
});

describe('用户导出权限（安全回归）', () => {
  /** 构造认证中间件：固定注入测试用户，跳过真实 JWT 校验 */
  function createAuthMiddlewareForTest(jwt: ReturnType<typeof createMockJWTManager>) {
    return createAuthMiddleware(jwt, 'test-secret');
  }

  /** 从编译路由表中按 strippedPath + method 定位处理器 */
  function findRouteHandler(
    compiled: Record<string, Record<string, (req: Request) => Promise<Response>>>,
    path: string,
    method: string,
  ) {
    return compiled[path]?.[method];
  }

  /** 构造携带用户信息的 mock token（mock JWT verify 直接 base64 解码首段） */
  const testToken = Buffer.from(
    JSON.stringify({ sub: 'u1', roles: ['editor'], username: 'editor' }),
  ).toString('base64url');

  /** 构造导出接口请求 */
  function buildExportRequest() {
    const request = new Request('http://localhost/api/system/users/export', {
      method: 'POST',
      headers: { Authorization: `Bearer ${testToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    (request as Request & { params?: Record<string, string> }).params = {};
    return request;
  }

  /** 构造编译后的用户路由，便于直接调用指定方法+路径 */
  function setupRoutes(rbacHasPermission: boolean) {
    const mockExec = createMockExecutor();
    const { db, registerModel } = createMockDatabase(mockExec);
    registerModel('sys_user', 'sys_user', true);
    const cache = createTestCache();
    const passwordHasher = createMockPasswordHasher();
    const configService = createMockConfigService();
    const userService = createUserService({
      db,
      passwordHasher,
      cache,
      configService,
      governance: allowRoleGrants,
    });

    const jwt = createMockJWTManager();
    const authMiddleware = createAuthMiddlewareForTest(jwt);
    const rbac = createMockRBAC();
    rbac.hasPermission.mockReturnValue(rbacHasPermission as never);
    const perm = createPermMiddleware(rbac as never);

    const dataScopeResolver = {
      resolve: async (user: { id: string }) => ({
        all: true,
        departmentIds: [],
        self: true,
        userId: user.id,
      }),
      canAccessUser: async () => true,
      canMutateUser: async () => true,
      filterMutableUserIds: async (_user: unknown, ids: string[]) => new Set(ids),
      canAssignDepartment: async () => true,
    };
    return createUserRoutes(
      userService,
      authMiddleware,
      perm,
      dataScopeResolver,
      async () => {},
    ).compile();
  }

  test('POST /api/system/users/export 无 user:export 权限时返回 403', async () => {
    const compiled = setupRoutes(false);
    // 找到导出路由的处理器
    const handler = findRouteHandler(compiled, '/api/system/users/export', 'POST');
    expect(handler).toBeDefined();

    const response = await handler!(buildExportRequest());
    expect(response.status).toBe(403);
    const body = (await response.json()) as { message?: string };
    expect(body.message).toContain('system:user:export');
  });

  test('POST /api/system/users/export 拥有权限时正常导出', async () => {
    const compiled = setupRoutes(true);
    const handler = findRouteHandler(compiled, '/api/system/users/export', 'POST');
    expect(handler).toBeDefined();

    const response = await handler!(buildExportRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/csv');
  });
});

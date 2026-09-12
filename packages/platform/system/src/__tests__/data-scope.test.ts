import { describe, expect, test } from 'bun:test';
import { type Database, createDatabase } from '@ventostack/database';
import { mergeDataScopes } from '../services/data-scope';
import { DataScopeResolutionError, createDataScopeResolver } from '../services/data-scope';
import { createMockDatabase, createMockExecutor } from './helpers';

describe('mergeDataScopes', () => {
  test('全部数据权限覆盖其他角色限制', () => {
    expect(
      mergeDataScopes(
        'u1',
        'd1',
        [
          { id: 'r1', dataScope: 1 },
          { id: 'r2', dataScope: 4 },
        ],
        new Map(),
        new Map(),
      ).all,
    ).toBe(true);
  });

  test('多角色按并集合并本人、部门、子部门和自定义部门', () => {
    const result = mergeDataScopes(
      'u1',
      'd1',
      [
        { id: 'dept', dataScope: 3 },
        { id: 'self', dataScope: 4 },
        { id: 'custom', dataScope: 5 },
      ],
      new Map([['custom', ['d9']]]),
      new Map([['d1', ['d2', 'd3']]]),
    );
    expect(result).toEqual({
      all: false,
      departmentIds: ['d1', 'd2', 'd3', 'd9'],
      self: true,
      userId: 'u1',
    });
  });

  test('没有部门时部门范围为空且不会退化为全部数据', () => {
    expect(mergeDataScopes('u1', null, [{ id: 'r1', dataScope: 2 }], new Map(), new Map())).toEqual(
      { all: false, departmentIds: [], self: false, userId: 'u1' },
    );
  });

  test('解析存储异常时返回可识别的 503 错误而不是放开权限', async () => {
    const cause = new Error('database unavailable');
    const db = {
      query: () => {
        throw cause;
      },
    } as unknown as Database;
    const resolver = createDataScopeResolver(db);
    try {
      await resolver.resolve({ id: 'u1', username: 'user', roles: ['user'] });
      throw new Error('expected resolver to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(DataScopeResolutionError);
      expect((error as DataScopeResolutionError).code).toBe(503);
      expect((error as DataScopeResolutionError).errorCode).toBe('DATA_SCOPE_RESOLUTION_FAILED');
      expect((error as DataScopeResolutionError).cause).toBe(cause);
    }
  });

  test('JWT 中残留 admin 角色不会绕过数据库当前角色', async () => {
    const mockExec = createMockExecutor();
    const { db, registerModel } = createMockDatabase(mockExec);
    registerModel('sys_user', 'sys_user', true);
    registerModel('sys_user_role', 'sys_user_role', false);
    registerModel('sys_role', 'sys_role', true);
    mockExec.results.set('SELECT dept_id FROM sys_user', [{ dept_id: 'd1' }]);
    mockExec.results.set('SELECT role_id FROM sys_user_role', [{ role_id: 'r-user' }]);
    mockExec.results.set('SELECT id, code, data_scope FROM sys_role', [
      { id: 'r-user', code: 'user', data_scope: 4 },
    ]);

    const scope = await createDataScopeResolver(db).resolve({
      id: 'u1',
      username: 'user',
      roles: ['admin'],
    });
    expect(scope).toEqual({ all: false, departmentIds: [], self: true, userId: 'u1' });
  });

  test('拥有全部数据范围的非 admin 仍不能修改 admin 用户', async () => {
    const db = createDatabase({
      executor: async (text, params = []) => {
        if (text.includes('FROM sys_user_role')) {
          return params[0] === 'target-admin' ? [{ role_id: 'r-admin' }] : [{ role_id: 'r-all' }];
        }
        if (text.includes('FROM sys_role')) {
          return params.includes('r-admin')
            ? [{ id: 'r-admin', code: 'admin', data_scope: 1 }]
            : [{ id: 'r-all', code: 'manager', data_scope: 1 }];
        }
        if (text.includes('FROM sys_user')) return [{ dept_id: 'd1' }];
        return [];
      },
    });
    const resolver = createDataScopeResolver(db);
    const allowed = await resolver.canMutateUser(
      { id: 'manager', username: 'manager', roles: ['manager'] },
      'target-admin',
    );
    expect(allowed).toBe(false);
  });
});

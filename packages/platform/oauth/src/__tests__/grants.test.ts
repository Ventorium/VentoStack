import { describe, expect, test } from 'bun:test';
import type { AuthUser } from '@ventostack/auth';
import type { Database } from '@ventostack/database';
import {
  OAuthApplicationDeptGrantModel,
  OAuthApplicationModel,
  OAuthApplicationRoleGrantModel,
  OAuthApplicationUserGrantModel,
} from '../models';
import { createOAuthGrantService } from '../services/grants';

const user = { id: 'user-1', username: 'zhangsan', roles: [] } as AuthUser;

function fixture(subjectsValid = true) {
  const batches: Array<Record<string, unknown>[]> = [];
  const deletes: string[] = [];
  const rows = new Map<unknown, Array<Record<string, unknown>>>([
    [OAuthApplicationRoleGrantModel, [{ role_id: 'role-1' }]],
    [OAuthApplicationUserGrantModel, [{ user_id: 'user-1' }]],
    [OAuthApplicationDeptGrantModel, [{ dept_id: 'dept-1', scope: 'SELF' }]],
  ]);
  const db = {
    query: (model: unknown) => {
      const builder = {
        where: () => builder,
        select: () => builder,
        get: async () => (model === OAuthApplicationModel ? { id: 'app-1' } : null),
        list: async () => rows.get(model) ?? [],
        delete: async () => deletes.push('delete'),
        batchInsert: async (values: Array<Record<string, unknown>>) => batches.push(values),
      };
      return builder;
    },
    raw: async (sql: string, params: unknown[]) => {
      if (sql.includes('SELECT DISTINCT a.id'))
        return [
          {
            id: 'app-1',
            identifier: 'reconcile',
            name: '智能对账',
            description: 'desc',
            icon_url: '/icon',
            homepage_url: 'https://app.example/',
            sort: 1,
          },
        ];
      if (sql.includes('SELECT id FROM sys_'))
        return subjectsValid ? (params.slice(1) as string[]).map((id) => ({ id })) : [];
      if (sql.includes('WITH RECURSIVE user_dept')) return [{ allowed: 1 }];
      return [];
    },
    transaction: async (fn: (tx: Database) => Promise<void>) => fn(db as unknown as Database),
  } as unknown as Database;
  return { service: createOAuthGrantService({ db, tenantId: 'tenant-1' }), batches, deletes };
}

describe('OAuth application grants', () => {
  test('reads and atomically replaces deduplicated tenant grants', async () => {
    const { service, batches, deletes } = fixture();
    expect(await service.get('app-1')).toEqual({
      roleIds: ['role-1'],
      userIds: ['user-1'],
      departments: [{ deptId: 'dept-1', scope: 'SELF' }],
    });
    await service.replace('app-1', {
      roleIds: ['role-1', 'role-1'],
      userIds: ['user-1'],
      departments: [
        { deptId: 'dept-1', scope: 'SELF' },
        { deptId: 'dept-1', scope: 'SELF_AND_DESCENDANTS' },
      ],
    });
    expect(deletes).toHaveLength(3);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(1);
    expect(batches[2]![0]).toMatchObject({ scope: 'SELF_AND_DESCENDANTS' });
  });

  test('rejects invalid or oversized subject sets', async () => {
    await expect(
      fixture(false).service.replace('app-1', {
        roleIds: ['missing'],
        userIds: [],
        departments: [],
      }),
    ).rejects.toThrow('授权主体不存在');
    await expect(
      fixture().service.replace('app-1', {
        roleIds: Array.from({ length: 101 }, (_, index) => `role-${index}`),
        userIds: [],
        departments: [],
      }),
    ).rejects.toThrow('不能超过 100');
  });

  test('computes access and maps portal applications without exposing grants', async () => {
    const { service } = fixture();
    expect(await service.canAccess('app-1', user)).toBeTrue();
    expect(await service.portal(user, '对账')).toEqual([
      {
        id: 'app-1',
        identifier: 'reconcile',
        name: '智能对账',
        description: 'desc',
        iconUrl: '/icon',
        homepageUrl: 'https://app.example/',
        sort: 1,
      },
    ]);
  });
});

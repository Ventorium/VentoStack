import { describe, expect, test } from 'bun:test';
import type { Database } from '@ventostack/database';
import { createOAuthContextService } from '../services/context';
import type { OAuthTokenSigner } from '../services/token-signer';

const claims = {
  sub: 'user-1',
  client_id: 'client-1',
  tenant_id: 'tenant-1',
  jti: 'jti-1',
  sid: 'sid-1',
  scope: 'openid profile context roles.read departments.read menus.read permissions.read',
};

function createService(options?: { active?: boolean; backendActive?: boolean; scope?: string }) {
  const raw = async (sql: string): Promise<unknown[]> => {
    if (sql.includes('FROM oauth_access_token'))
      return options?.active === false
        ? []
        : [
            {
              id: 'user-1',
              username: 'zhangsan',
              nickname: '张三',
              avatar: 'avatar.png',
              dept_id: 'dept-1',
              application_id: 'app-1',
              identifier: 'reconcile',
              application_name: '智能对账',
              icon_url: '/icon',
              backend_session_id: 'backend-1',
            },
          ];
    if (sql.includes('FROM sys_role')) return [{ id: 'role-1', name: '管理员', code: 'admin' }];
    if (sql.includes('WITH RECURSIVE chain')) return [{ id: 'dept-1', name: '研发部' }];
    if (sql.includes('FROM sys_menu'))
      return [
        {
          id: 'menu-child',
          parent_id: 'menu-root',
          name: '任务',
          path: '/task',
          component: null,
          redirect: null,
          type: 2,
          permission: 'task:list',
          icon: null,
          sort: 2,
          visible: true,
        },
        {
          id: 'menu-root',
          parent_id: null,
          name: '首页',
          path: '/',
          component: null,
          redirect: null,
          type: 1,
          permission: null,
          icon: null,
          sort: 1,
          visible: true,
        },
      ];
    return [];
  };
  return createOAuthContextService({
    db: { raw } as unknown as Database,
    signer: {
      verify: async () => ({ ...claims, scope: options?.scope ?? claims.scope }),
    } as unknown as OAuthTokenSigner,
    issuer: 'https://id.example/api/oauth/',
    audience: 'context',
    isBackendSessionActive: async () => options?.backendActive !== false,
  });
}

describe('OAuth application context', () => {
  test('returns only scope-authorized identity, organization and menu data', async () => {
    const result = await createService().get('access-token');
    expect(result.user).toMatchObject({ id: 'user-1', displayName: '张三' });
    expect(result.application).toMatchObject({ id: 'reconcile', name: '智能对账' });
    expect(result.roles).toHaveLength(1);
    expect(result.departments).toHaveLength(1);
    expect(result.permissions).toEqual(['task:list']);
    expect((result.menus as Array<{ id: string; children: unknown[] }>)[0]).toMatchObject({
      id: 'menu-root',
    });
  });

  test('userinfo honors profile scope', async () => {
    expect(await createService({ scope: 'openid' }).userInfo('token')).toEqual({ sub: 'user-1' });
    expect(await createService().userInfo('token')).toMatchObject({
      sub: 'user-1',
      preferred_username: 'zhangsan',
      name: '张三',
      picture: 'avatar.png',
    });
  });

  test('fails closed for revoked sessions and missing context scope', async () => {
    await expect(createService({ active: false }).get('token')).rejects.toThrow(
      'Access Token 已失效',
    );
    await expect(createService({ backendActive: false }).get('token')).rejects.toThrow(
      '中心 Session 已失效',
    );
    await expect(createService({ scope: 'openid' }).get('token')).rejects.toThrow(
      '缺少 context Scope',
    );
  });
});

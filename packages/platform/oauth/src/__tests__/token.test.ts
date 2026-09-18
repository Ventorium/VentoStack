import { describe, expect, test } from 'bun:test';
import type { Database } from '@ventostack/database';
import { digestClientSecret } from '../services/application-security';
import { createOAuthTokenService } from '../services/token';
import type { OAuthTokenSigner } from '../services/token-signer';

const verifier = 'a'.repeat(43);

async function setup(
  handler: (sql: string, params: unknown[], client: Record<string, unknown>) => unknown[],
) {
  const calls: string[] = [];
  const secretPepper = 'p'.repeat(32);
  const client = {
    id: 'app-1',
    client_id: 'client-1',
    client_secret_digest: await digestClientSecret('secret', secretPepper),
    name: 'App',
    identifier: 'app',
    redirect_uri: 'https://app.example/callback',
    allowed_scopes: 'openid profile offline_access',
    offline_access_enabled: true,
    enabled: true,
    status: 'ACTIVE',
  };
  const db = {
    raw: async (sql: string, params: unknown[] = []) => {
      calls.push(sql);
      return handler(sql, params, client);
    },
    transaction: async (fn: (tx: Database) => Promise<unknown>) => fn(db as Database),
  } as unknown as Database;
  const signed: Array<Record<string, unknown>> = [];
  const signer = {
    sign: async (claims: Record<string, unknown>) => {
      signed.push(claims);
      return `signed-${signed.length}`;
    },
  } as unknown as OAuthTokenSigner;
  return {
    calls,
    signed,
    client,
    service: createOAuthTokenService({
      db,
      signer,
      secretPepper,
      issuer: 'https://id.example/api/oauth/',
      audience: 'https://id.example/api/oauth/me/context',
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 3600,
      isBackendSessionActive: async () => true,
    }),
  };
}

describe('OAuth token service', () => {
  test('exchanges a one-time code and issues access, ID and refresh tokens', async () => {
    const fixture = await setup((sql, _params, client) => {
      if (sql.includes('FROM oauth_application')) return [client];
      if (sql.includes('UPDATE oauth_authorization_code'))
        return [
          {
            tenant_id: 'tenant-1',
            user_id: 'user-1',
            application_id: 'app-1',
            session_id: 'sso-1',
            scope: 'openid profile offline_access',
            nonce: 'nonce',
            auth_time: new Date('2026-01-01T00:00:00Z'),
            backend_session_id: 'backend-1',
          },
        ];
      return [];
    });
    const result = await fixture.service.exchangeCode({
      clientId: 'client-1',
      secret: 'secret',
      code: 'authorization-code',
      redirectUri: 'https://app.example/callback',
      codeVerifier: verifier,
    });
    expect(result.access_token).toBe('signed-1');
    expect(result.id_token).toBe('signed-2');
    expect(result.refresh_token).toBeString();
    expect(fixture.signed[0]).toMatchObject({ client_id: 'client-1', sub: 'user-1' });
    expect(
      fixture.calls.some((sql) => sql.includes('INSERT INTO oauth_client_session')),
    ).toBeTrue();
    expect(fixture.calls.some((sql) => sql.includes('INSERT INTO oauth_refresh_token'))).toBeTrue();
  });

  test('rejects bad client credentials and malformed PKCE verifier', async () => {
    const fixture = await setup((sql, _params, client) =>
      sql.includes('FROM oauth_application') ? [client] : [],
    );
    await expect(fixture.service.authenticate('client-1', 'wrong')).rejects.toThrow(
      '客户端认证失败',
    );
    await expect(
      fixture.service.exchangeCode({
        clientId: 'client-1',
        secret: 'secret',
        code: 'code',
        redirectUri: 'https://app.example/callback',
        codeVerifier: 'short',
      }),
    ).rejects.toThrow('授权码或 PKCE 校验失败');
  });

  test('commits the family revocation even though the replay request fails', async () => {
    const secretPepper = 'p'.repeat(32);
    const client = {
      id: 'app-1',
      client_id: 'client-1',
      client_secret_digest: await digestClientSecret('secret', secretPepper),
      name: 'App',
      identifier: 'app',
      redirect_uri: 'https://app.example/callback',
      allowed_scopes: 'openid profile offline_access',
      offline_access_enabled: true,
      enabled: true,
      status: 'ACTIVE',
    };
    // 模拟真实事务语义：回调抛错时事务内写入被丢弃（ROLLBACK）
    const applied: string[] = [];
    const revoked: string[] = [];
    const db = {
      raw: async (sql: string) => {
        if (sql.includes('FROM oauth_application')) return [client];
        if (sql.includes('UPDATE oauth_refresh_token r')) return [];
        if (sql.includes('SELECT family_id'))
          return [{ family_id: 'family-1', session_id: 'session-1' }];
        applied.push(sql);
        if (sql.includes('SET revoked_at')) revoked.push(sql);
        return [];
      },
      transaction: async (fn: (tx: Database) => Promise<unknown>) => {
        const mark = applied.length;
        try {
          return await fn(db as unknown as Database);
        } catch (error) {
          applied.length = mark;
          throw error;
        }
      },
    } as unknown as Database;
    const service = createOAuthTokenService({
      db,
      signer: { sign: async () => 'signed' } as unknown as OAuthTokenSigner,
      secretPepper,
      issuer: 'https://id.example/api/oauth/',
      audience: 'https://id.example/api/oauth/me/context',
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 3600,
      isBackendSessionActive: async () => true,
    });
    await expect(
      service.refresh({ clientId: 'client-1', secret: 'secret', refreshToken: 'used-token' }),
    ).rejects.toThrow('Refresh Token 无效或已被使用');
    // 重放检测的撤销必须真正提交，不能被失败请求的事务回滚掉
    expect(applied.some((sql) => sql.includes('WHERE family_id'))).toBeTrue();
    expect(revoked).toHaveLength(3);
  });

  test('rotates refresh tokens and only permits narrower scopes', async () => {
    const fixture = await setup((sql, _params, client) => {
      if (sql.includes('FROM oauth_application')) return [client];
      if (sql.includes('UPDATE oauth_refresh_token r'))
        return [
          {
            id: 'refresh-1',
            family_id: 'family-1',
            tenant_id: 'tenant-1',
            user_id: 'user-1',
            application_id: 'app-1',
            session_id: 'client-session-1',
            scope: 'openid profile',
            sid: 'sid-1',
            auth_time: new Date('2026-01-01T00:00:00Z'),
            backend_session_id: 'backend-1',
          },
        ];
      return [];
    });
    const result = await fixture.service.refresh({
      clientId: 'client-1',
      secret: 'secret',
      refreshToken: 'refresh-token',
      scope: 'openid',
    });
    expect(result.scope).toBe('openid');
    expect(result.refresh_token).toBeString();
    await expect(
      fixture.service.refresh({
        clientId: 'client-1',
        secret: 'secret',
        refreshToken: 'refresh-token',
        scope: 'openid roles.read',
      }),
    ).rejects.toThrow('刷新时只能缩小 Scope');
  });
});

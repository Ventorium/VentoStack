import { describe, expect, test } from 'bun:test';
import type { Database } from '@ventostack/database';
import { createOAuthTokenLifecycleService } from '../services/token-lifecycle';
import type { OAuthTokenSigner } from '../services/token-signer';

function service(raw: (sql: string) => unknown[], verify: () => Promise<Record<string, unknown>>) {
  const calls: string[] = [];
  const db = {
    raw: async (sql: string) => {
      calls.push(sql);
      return raw(sql);
    },
    transaction: async (fn: (tx: Database) => Promise<unknown>) => fn(db as Database),
  } as unknown as Database;
  return {
    calls,
    lifecycle: createOAuthTokenLifecycleService({
      db,
      signer: { verify } as unknown as OAuthTokenSigner,
      issuer: 'https://id.example/api/oauth',
      audience: 'context',
      authenticate: async () => ({ id: 'app-1', client_id: 'client-1' }) as never,
      isBackendSessionActive: async () => true,
    }),
  };
}

describe('OAuth token revocation and introspection', () => {
  test('revokes an entire refresh family and its access tokens', async () => {
    const fixture = service(
      (sql) =>
        sql.includes('SELECT family_id')
          ? [{ family_id: 'family-1', session_id: 'session-1' }]
          : [],
      async () => ({}),
    );
    await fixture.lifecycle.revoke({ clientId: 'client-1', secret: 'secret', token: 'refresh' });
    expect(fixture.calls.some((sql) => sql.includes('WHERE family_id'))).toBeTrue();
    expect(fixture.calls.some((sql) => sql.includes('oauth_access_token SET revoked'))).toBeTrue();
  });

  test('revokes a matching JWT and hides invalid token state', async () => {
    const fixture = service(
      () => [],
      async () => ({ client_id: 'client-1', jti: 'jti-1' }),
    );
    await fixture.lifecycle.revoke({ clientId: 'client-1', secret: 'secret', token: 'access' });
    expect(fixture.calls.some((sql) => sql.includes('WHERE jti=$1'))).toBeTrue();

    const invalid = service(
      () => [],
      async () => {
        throw new Error('bad signature');
      },
    );
    expect(
      await invalid.lifecycle.introspect({ clientId: 'client-1', secret: 'secret', token: 'bad' }),
    ).toEqual({ active: false });
  });

  test('returns minimal claims only for an active bound token', async () => {
    const fixture = service(
      (sql) =>
        sql.includes('SELECT ss.backend_session_id')
          ? [{ backend_session_id: 'backend-1', user_id: 'user-1' }]
          : [],
      async () => ({
        client_id: 'client-1',
        jti: 'jti-1',
        scope: 'openid',
        sub: 'user-1',
        aud: 'context',
        iss: 'https://id.example/api/oauth',
        exp: 2,
        iat: 1,
      }),
    );
    expect(
      await fixture.lifecycle.introspect({
        clientId: 'client-1',
        secret: 'secret',
        token: 'access',
      }),
    ).toMatchObject({ active: true, client_id: 'client-1', token_type: 'Bearer' });
  });
});

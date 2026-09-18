import { describe, expect, test } from 'bun:test';
import type { Database } from '@ventostack/database';
import { OAuthProtocolError, createOAuthAuthorizationService } from '../services/authorization';
import type { OAuthGrantService } from '../services/grants';

const CLIENT = {
  id: 'app-1',
  client_id: 'client-1',
  client_secret_digest: 'digest',
  name: 'Test',
  identifier: 'test',
  redirect_uri: 'https://client.example/callback',
  allowed_scopes: 'openid profile',
  offline_access_enabled: false,
  enabled: true,
  status: 'ACTIVE',
};

function service(found = true) {
  const db = {
    raw: async (sql: string) => (sql.includes('FROM oauth_application') && found ? [CLIENT] : []),
  } as unknown as Database;
  return createOAuthAuthorizationService({
    db,
    grants: {} as OAuthGrantService,
    tenantId: 'tenant-1',
    issuer: 'https://id.example/api/oauth',
    loginPath: '/login',
    secureCookies: true,
    authorizationCodeTtlSeconds: 60,
    ssoIdleTtlSeconds: 1800,
    ssoAbsoluteTtlSeconds: 28_800,
    isBackendSessionActive: async () => true,
  });
}

const INPUT = {
  responseType: 'code',
  clientId: 'client-1',
  redirectUri: 'https://client.example/callback',
  scope: 'openid profile',
  state: 'state-with-at-least-22-chars',
  nonce: 'nonce',
  codeChallenge: 'c'.repeat(43),
  codeChallengeMethod: 'S256',
};

describe('OAuth authorization errors', () => {
  test('redirects an error only after exact client redirect validation', async () => {
    const location = await service().errorRedirect(
      {
        clientId: CLIENT.client_id,
        redirectUri: CLIENT.redirect_uri,
        state: 'original-state',
      },
      new OAuthProtocolError('invalid_scope', 'scope denied'),
    );
    const url = new URL(location!);
    expect(url.searchParams.get('error')).toBe('invalid_scope');
    expect(url.searchParams.get('state')).toBe('original-state');
    expect(url.searchParams.get('iss')).toBe('https://id.example/api/oauth');
  });

  test('does not redirect to an unregistered URI', async () => {
    const location = await service().errorRedirect(
      {
        clientId: CLIENT.client_id,
        redirectUri: 'https://attacker.example/callback',
        state: 'original-state',
      },
      new OAuthProtocolError('invalid_request', 'redirect mismatch'),
    );
    expect(location).toBeNull();
  });

  test('does not redirect for an unknown client', async () => {
    const location = await service(false).errorRedirect(
      { clientId: 'unknown', redirectUri: CLIENT.redirect_uri, state: 'original-state' },
      new OAuthProtocolError('invalid_request', 'unknown client'),
    );
    expect(location).toBeNull();
  });

  test('validates response type, state, PKCE and requested scopes', async () => {
    await expect(service().authorize({ ...INPUT, responseType: 'token' })).rejects.toThrow(
      '仅支持 code',
    );
    await expect(service().authorize({ ...INPUT, state: 'short' })).rejects.toThrow(
      'state 长度无效',
    );
    await expect(service().authorize({ ...INPUT, codeChallengeMethod: 'plain' })).rejects.toThrow(
      'PKCE S256',
    );
    await expect(service().authorize({ ...INPUT, scope: 'openid roles.read' })).rejects.toThrow(
      '未授权 Scope',
    );
  });

  test('persists a login transaction when no SSO session exists', async () => {
    const calls: string[] = [];
    const db = {
      raw: async (sql: string) => {
        calls.push(sql);
        return sql.includes('FROM oauth_application') ? [CLIENT] : [];
      },
    } as unknown as Database;
    const authorization = createOAuthAuthorizationService({
      db,
      grants: { canAccess: async () => true } as unknown as OAuthGrantService,
      tenantId: 'tenant-1',
      issuer: 'https://id.example/api/oauth',
      loginPath: '/login',
      secureCookies: false,
      authorizationCodeTtlSeconds: 60,
      ssoIdleTtlSeconds: 1800,
      ssoAbsoluteTtlSeconds: 28_800,
      isBackendSessionActive: async () => true,
    });
    const result = await authorization.authorize(INPUT);
    expect(result.kind).toBe('login');
    expect(result.location).toStartWith('https://id.example/login?oauth_request=');
    expect(calls.some((sql) => sql.includes('INSERT INTO oauth_authorization_request'))).toBeTrue();
  });

  test('uses an active SSO session to issue a one-time authorization code', async () => {
    const calls: string[] = [];
    const db = {
      raw: async (sql: string) => {
        calls.push(sql);
        if (sql.includes('FROM oauth_application')) return [CLIENT];
        if (sql.includes('FROM oauth_sso_session'))
          return [
            {
              id: 'sso-1',
              tenant_id: 'tenant-1',
              user_id: 'user-1',
              backend_session_id: 'backend-1',
              absolute_expires_at: new Date(Date.now() + 60_000),
            },
          ];
        return [];
      },
    } as unknown as Database;
    const authorization = createOAuthAuthorizationService({
      db,
      grants: { canAccess: async () => true } as unknown as OAuthGrantService,
      tenantId: 'tenant-1',
      issuer: 'https://id.example/api/oauth',
      loginPath: '/login',
      secureCookies: true,
      authorizationCodeTtlSeconds: 60,
      ssoIdleTtlSeconds: 1800,
      ssoAbsoluteTtlSeconds: 28_800,
      isBackendSessionActive: async () => true,
    });
    const result = await authorization.authorize(INPUT, 'sso-cookie');
    expect(result.kind).toBe('redirect');
    expect(new URL(result.location).searchParams.get('code')).toBeString();
    expect(calls.some((sql) => sql.includes('INSERT INTO oauth_authorization_code'))).toBeTrue();
  });

  test('bootstraps a new SSO session from the authenticated admin session', async () => {
    const db = {
      raw: async (sql: string) => {
        if (sql.includes('UPDATE oauth_authorization_request'))
          return [
            {
              application_id: 'app-1',
              redirect_uri: CLIENT.redirect_uri,
              scope: 'openid profile',
              state_value: INPUT.state,
              nonce: INPUT.nonce,
              code_challenge: INPUT.codeChallenge,
            },
          ];
        if (sql.includes('FROM oauth_application')) return [CLIENT];
        return [];
      },
    } as unknown as Database;
    const authorization = createOAuthAuthorizationService({
      db,
      grants: { canAccess: async () => true } as unknown as OAuthGrantService,
      tenantId: 'tenant-1',
      issuer: 'https://id.example/api/oauth',
      loginPath: '/login',
      secureCookies: true,
      authorizationCodeTtlSeconds: 60,
      ssoIdleTtlSeconds: 1800,
      ssoAbsoluteTtlSeconds: 28_800,
      isBackendSessionActive: async () => true,
    });
    const result = await authorization.bootstrap(
      {
        id: 'user-1',
        username: 'zhangsan',
        roles: [],
        tenantId: 'tenant-1',
        sessionId: 'backend-1',
      },
      'request-token',
    );
    expect(result.setCookie).toStartWith('__Host-vs_sso=');
    expect(result.setCookie).toContain('; Secure');
  });
});

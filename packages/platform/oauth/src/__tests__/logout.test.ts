import { describe, expect, test } from 'bun:test';
import type { Database } from '@ventostack/database';
import { createOAuthLogoutService } from '../services/logout';
import type { OAuthTokenSigner } from '../services/token-signer';

function token(audience: string): string {
  return `e30.${Buffer.from(JSON.stringify({ aud: audience })).toString('base64url')}.signature`;
}

describe('OIDC RP-Initiated Logout', () => {
  test('rejects an id_token_hint bound to another browser SSO session', async () => {
    const db = {
      raw: async (sql: string) => {
        if (sql.includes('FROM oauth_sso_session')) return [{ id: 'sso-current' }];
        if (sql.includes('FROM oauth_client_session')) return [];
        return [];
      },
    } as unknown as Database;
    const signer = {
      verify: async () => ({ sid: 'sid-other', aud: 'client-1' }),
    } as unknown as OAuthTokenSigner;
    const service = createOAuthLogoutService({
      db,
      signer,
      issuer: 'https://id.example/api/oauth',
      tenantId: 'tenant-1',
    });
    await expect(
      service.prepare({ ssoToken: 'current-cookie', idTokenHint: token('client-1') }),
    ).rejects.toThrow('当前 Session 不匹配');
  });

  test('rejects mismatched client_id and id_token_hint audience', async () => {
    const service = createOAuthLogoutService({
      db: {} as Database,
      signer: {
        verify: async () => ({ sid: 'sid-1', aud: 'client-1' }),
      } as unknown as OAuthTokenSigner,
      issuer: 'https://id.example/api/oauth',
      tenantId: 'tenant-1',
    });
    await expect(
      service.prepare({
        idTokenHint: token('client-1'),
        clientId: 'client-2',
      }),
    ).rejects.toThrow('client_id 与 id_token_hint 不匹配');
  });
});

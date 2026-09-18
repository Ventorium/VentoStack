import { describe, expect, test } from 'bun:test';
import {
  appendOAuthParams,
  parseBasicAuthorization,
  sha256,
  validatePkceVerifier,
} from '../services/protocol-utils';

describe('OAuth protocol utilities', () => {
  test('computes the RFC 7636 S256 challenge', async () => {
    expect(await sha256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  test('enforces the PKCE verifier character and length bounds', () => {
    expect(validatePkceVerifier('a'.repeat(43))).toBe(true);
    expect(validatePkceVerifier('a'.repeat(42))).toBe(false);
    expect(validatePkceVerifier(`${'a'.repeat(42)}+`)).toBe(false);
  });

  test('parses client_secret_basic and does not accept other schemes', () => {
    expect(
      parseBasicAuthorization(`Basic ${Buffer.from('client:secret').toString('base64')}`),
    ).toEqual({
      clientId: 'client',
      secret: 'secret',
    });
    expect(parseBasicAuthorization('Bearer token')).toBeNull();
  });

  test('adds code, state and issuer without replacing existing redirect parameters', () => {
    expect(
      appendOAuthParams('https://app.test/callback?source=sso', {
        code: 'one-time-code',
        state: 'state-value',
        iss: 'https://auth.test/api/oauth',
      }),
    ).toBe(
      'https://app.test/callback?source=sso&code=one-time-code&state=state-value&iss=https%3A%2F%2Fauth.test%2Fapi%2Foauth',
    );
  });
});

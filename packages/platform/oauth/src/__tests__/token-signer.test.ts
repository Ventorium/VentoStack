import { describe, expect, test } from 'bun:test';
import { createRS256TokenSigner } from '../services/token-signer';

function pem(label: string, bytes: ArrayBuffer): string {
  const body =
    Buffer.from(bytes)
      .toString('base64')
      .match(/.{1,64}/g)
      ?.join('\n') ?? '';
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
}

describe('RS256 OAuth token signer', () => {
  test('publishes the matching public JWK and signs an RS256 JWT', async () => {
    const pair = (await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair;
    const signer = createRS256TokenSigner({
      keyId: 'test-key-1',
      privateKeyPem: pem('PRIVATE KEY', await crypto.subtle.exportKey('pkcs8', pair.privateKey)),
      publicKeyPem: pem('PUBLIC KEY', await crypto.subtle.exportKey('spki', pair.publicKey)),
    });

    const now = Math.floor(Date.now() / 1000);
    const token = await signer.sign(
      {
        iss: 'https://auth.test/api/oauth',
        sub: 'user-1',
        aud: 'resource-api',
        iat: now,
        exp: now + 60,
      },
      { typ: 'at+jwt' },
    );
    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
    expect(JSON.parse(Buffer.from(encodedHeader!, 'base64url').toString())).toEqual({
      alg: 'RS256',
      kid: 'test-key-1',
      typ: 'at+jwt',
    });
    expect(JSON.parse(Buffer.from(encodedPayload!, 'base64url').toString()).sub).toBe('user-1');
    expect(
      await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        pair.publicKey,
        Buffer.from(encodedSignature!, 'base64url'),
        new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
      ),
    ).toBe(true);
    expect(await signer.jwk()).toMatchObject({ alg: 'RS256', use: 'sig', kid: 'test-key-1' });
    expect(
      await signer.verify(token, {
        issuer: 'https://auth.test/api/oauth',
        audience: 'resource-api',
        typ: 'at+jwt',
      }),
    ).toMatchObject({ sub: 'user-1', aud: 'resource-api' });
  });

  test('publishes and verifies a retired public key while signing with the active key', async () => {
    const algorithm = {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    };
    const active = (await crypto.subtle.generateKey(algorithm, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const retired = (await crypto.subtle.generateKey(algorithm, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const retiredJwk = await crypto.subtle.exportKey('jwk', retired.publicKey);
    const signer = createRS256TokenSigner({
      keyId: 'active-key',
      privateKeyPem: pem('PRIVATE KEY', await crypto.subtle.exportKey('pkcs8', active.privateKey)),
      publicKeyPem: pem('PUBLIC KEY', await crypto.subtle.exportKey('spki', active.publicKey)),
      verificationJwks: [{ ...retiredJwk, kid: 'retired-key', alg: 'RS256', use: 'sig' }],
    });
    expect((await signer.jwks()).map((key) => (key as JsonWebKey & { kid: string }).kid)).toEqual([
      'active-key',
      'retired-key',
    ]);
    const retiredSigner = createRS256TokenSigner({
      keyId: 'retired-key',
      privateKeyPem: pem('PRIVATE KEY', await crypto.subtle.exportKey('pkcs8', retired.privateKey)),
      publicKeyPem: pem('PUBLIC KEY', await crypto.subtle.exportKey('spki', retired.publicKey)),
    });
    const now = Math.floor(Date.now() / 1000);
    const oldToken = await retiredSigner.sign({
      iss: 'https://auth.test/api/oauth',
      aud: 'resource-api',
      sub: 'user-1',
      iat: now,
      exp: now + 60,
    });
    expect(
      await signer.verify(oldToken, {
        issuer: 'https://auth.test/api/oauth',
        audience: 'resource-api',
        typ: 'JWT',
      }),
    ).toMatchObject({ sub: 'user-1' });
  });
});

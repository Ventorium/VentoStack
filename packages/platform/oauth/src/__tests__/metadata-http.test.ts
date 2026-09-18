import { describe, expect, test } from 'bun:test';
import type { Context } from '@ventostack/core';
import { createOAuthMetadataRoutes } from '../routes/metadata';
import { createRS256TokenSigner } from '../services/token-signer';

function pem(label: string, bytes: ArrayBuffer): string {
  const body =
    Buffer.from(bytes)
      .toString('base64')
      .match(/.{1,64}/g)
      ?.join('\n') ?? '';
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
}

describe('OAuth metadata HTTP endpoints', () => {
  test('publishes discoverable endpoints and cacheable JWKS', async () => {
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
      keyId: 'metadata-key',
      privateKeyPem: pem('PRIVATE KEY', await crypto.subtle.exportKey('pkcs8', pair.privateKey)),
      publicKeyPem: pem('PUBLIC KEY', await crypto.subtle.exportKey('spki', pair.publicKey)),
    });
    const router = createOAuthMetadataRoutes({ signer, issuer: 'https://id.example/api/oauth' });
    const routes = router.routes();
    const metadataRoute = routes.find(
      (route) => route.path === '/api/oauth/.well-known/openid-configuration',
    )!;
    const jwksRoute = routes.find((route) => route.path === '/api/oauth/jwks')!;
    const metadata = (await metadataRoute.handler({} as Context)) as Response;
    expect(metadata.status).toBe(200);
    expect(await metadata.json()).toMatchObject({
      issuer: 'https://id.example/api/oauth',
      authorization_endpoint: 'https://id.example/api/oauth/authorize',
      userinfo_endpoint: 'https://id.example/api/oauth/userinfo',
      code_challenge_methods_supported: ['S256'],
      backchannel_logout_supported: true,
    });
    const jwks = (await jwksRoute.handler({
      request: new Request('https://id.example/api/oauth/jwks'),
    } as Context)) as Response;
    expect(jwks.status).toBe(200);
    const etag = jwks.headers.get('ETag');
    expect(etag).toBeTruthy();
    expect(await jwks.json()).toMatchObject({ keys: [{ kid: 'metadata-key', alg: 'RS256' }] });
    const cached = (await jwksRoute.handler({
      request: new Request('https://id.example/api/oauth/jwks', {
        headers: { 'If-None-Match': etag! },
      }),
    } as Context)) as Response;
    expect(cached.status).toBe(304);
  });
});

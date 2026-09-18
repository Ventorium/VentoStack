export interface OAuthTokenSigner {
  readonly algorithm: 'RS256';
  readonly keyId: string;
  sign(payload: Record<string, unknown>, header?: { typ?: string }): Promise<string>;
  verify(
    token: string,
    expected: { issuer: string; audience: string; typ: string; maxExpiredSeconds?: number },
  ): Promise<Record<string, unknown>>;
  jwk(): Promise<JsonWebKey>;
  jwks(): Promise<JsonWebKey[]>;
}

type OAuthJwk = JsonWebKey & { kid?: string; alg?: string; use?: string };

function base64url(value: Uint8Array | string): string {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return Buffer.from(bytes).toString('base64url');
}

function pemBytes(pem: string, label: string): ArrayBuffer {
  const match = pem.match(new RegExp(`-----BEGIN ${label}-----([\\s\\S]+?)-----END ${label}-----`));
  if (!match?.[1]) throw new Error(`Invalid ${label} PEM`);
  const source = Buffer.from(match[1].replace(/\s/g, ''), 'base64');
  const copy = new Uint8Array(source.length);
  copy.set(source);
  return copy.buffer;
}

export function createRS256TokenSigner(config: {
  keyId: string;
  privateKeyPem: string;
  publicKeyPem: string;
  verificationJwks?: OAuthJwk[];
}): OAuthTokenSigner {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(config.keyId)) throw new Error('Invalid OAuth key id');

  const privateKeyPromise = crypto.subtle.importKey(
    'pkcs8',
    pemBytes(config.privateKeyPem, 'PRIVATE KEY'),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const publicKeyPromise = crypto.subtle.importKey(
    'spki',
    pemBytes(config.publicKeyPem, 'PUBLIC KEY'),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    true,
    ['verify'],
  );
  const verificationKeysPromise = Promise.all(
    (config.verificationJwks ?? []).map(async (jwk) => {
      if (!jwk.kid || jwk.kty !== 'RSA' || (jwk.alg && jwk.alg !== 'RS256') || jwk.d)
        throw new Error('Invalid OAuth verification JWK');
      const key = await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        true,
        ['verify'],
      );
      return { kid: jwk.kid, key, jwk: { ...jwk, alg: 'RS256', use: 'sig' } };
    }),
  );

  return {
    algorithm: 'RS256',
    keyId: config.keyId,
    async sign(payload, header) {
      const encodedHeader = base64url(
        JSON.stringify({ alg: 'RS256', kid: config.keyId, typ: header?.typ ?? 'JWT' }),
      );
      const encodedPayload = base64url(JSON.stringify(payload));
      const signingInput = `${encodedHeader}.${encodedPayload}`;
      const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        await privateKeyPromise,
        new TextEncoder().encode(signingInput),
      );
      return `${signingInput}.${base64url(new Uint8Array(signature))}`;
    },
    async jwk() {
      const key = await crypto.subtle.exportKey('jwk', await publicKeyPromise);
      return { ...key, alg: 'RS256', use: 'sig', kid: config.keyId };
    },
    async jwks() {
      const active = await this.jwk();
      const historic = (await verificationKeysPromise)
        .filter((entry) => entry.kid !== config.keyId)
        .map((entry) => entry.jwk);
      return [active, ...historic];
    },
    async verify(token, expected) {
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Invalid JWT');
      const [encodedHeader, encodedPayload, encodedSignature] = parts as [string, string, string];
      const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString()) as Record<
        string,
        unknown
      >;
      if (header.alg !== 'RS256' || header.typ !== expected.typ || header.jku || header.x5u)
        throw new Error('Invalid JWT header');
      const historic = await verificationKeysPromise;
      const verificationKey =
        header.kid === config.keyId
          ? await publicKeyPromise
          : historic.find((entry) => entry.kid === header.kid)?.key;
      if (!verificationKey) throw new Error('Unknown JWT key');
      const valid = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        verificationKey,
        Buffer.from(encodedSignature, 'base64url'),
        new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
      );
      if (!valid) throw new Error('Invalid JWT signature');
      const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString()) as Record<
        string,
        unknown
      >;
      const now = Math.floor(Date.now() / 1000);
      const audience = payload.aud;
      if (
        payload.iss !== expected.issuer ||
        !(
          audience === expected.audience ||
          (Array.isArray(audience) && audience.includes(expected.audience))
        ) ||
        typeof payload.exp !== 'number' ||
        payload.exp <= now - (expected.maxExpiredSeconds ?? 0) ||
        typeof payload.iat !== 'number' ||
        payload.iat > now + 60
      )
        throw new Error('Invalid JWT claims');
      return payload;
    },
  };
}

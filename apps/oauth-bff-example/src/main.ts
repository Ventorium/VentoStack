interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint: string;
  end_session_endpoint: string;
}

interface LocalSession {
  accessToken: string;
  refreshToken?: string;
  idToken: string;
  expiresAt: number;
}

interface PublicJwk {
  kty: string;
  kid?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
}

const issuer = required('OAUTH_ISSUER').replace(/\/$/, '');
const clientId = required('OAUTH_CLIENT_ID');
const clientSecret = required('OAUTH_CLIENT_SECRET');
const redirectUri = process.env.OAUTH_REDIRECT_URI ?? 'http://127.0.0.1:9400/callback';
const scopes = process.env.OAUTH_SCOPES ?? 'openid profile context offline_access';
const port = Number(process.env.PORT ?? 9400);
const sessions = new Map<string, LocalSession>();
const transactions = new Map<string, { verifier: string; nonce: string; returnTo: string }>();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function random(bytes = 32): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString('base64url');
}

async function sha256(value: string): Promise<string> {
  return Buffer.from(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  ).toString('base64url');
}

async function discovery(): Promise<Discovery> {
  const response = await fetch(`${issuer}/.well-known/openid-configuration`);
  if (!response.ok) throw new Error('OIDC discovery failed');
  return response.json() as Promise<Discovery>;
}

function cookie(request: Request, name: string): string | undefined {
  return request.headers
    .get('Cookie')
    ?.split(';')
    .map((item) => item.trim().split('='))
    .find(([key]) => key === name)?.[1];
}

async function verifyIdToken(token: string, metadata: Discovery, nonce: string): Promise<void> {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
  if (!encodedHeader || !encodedPayload || !encodedSignature) throw new Error('Invalid ID Token');
  const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString()) as {
    alg?: string;
    kid?: string;
  };
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString()) as {
    iss?: string;
    aud?: string;
    nonce?: string;
    exp?: number;
  };
  if (
    header.alg !== 'RS256' ||
    payload.iss !== metadata.issuer ||
    payload.aud !== clientId ||
    payload.nonce !== nonce ||
    !payload.exp ||
    payload.exp <= Date.now() / 1000
  )
    throw new Error('Invalid ID Token claims');
  const jwks = (await (await fetch(metadata.jwks_uri)).json()) as { keys: PublicJwk[] };
  const jwk = jwks.keys.find((key) => key.kid === header.kid);
  if (!jwk) throw new Error('Unknown ID Token key');
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    Buffer.from(encodedSignature, 'base64url'),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!valid) throw new Error('Invalid ID Token signature');
}

function redirect(location: string, cookieValue?: string): Response {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  if (cookieValue !== undefined)
    headers.append(
      'Set-Cookie',
      `bff_session=${cookieValue}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${cookieValue ? 3600 : 0}`,
    );
  return new Response(null, { status: 302, headers });
}

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/login') {
      const metadata = await discovery();
      const state = random();
      const verifier = random();
      const nonce = random();
      const returnTo = url.searchParams.get('returnTo')?.startsWith('/')
        ? url.searchParams.get('returnTo')!
        : '/';
      transactions.set(state, { verifier, nonce, returnTo });
      const authorization = new URL(metadata.authorization_endpoint);
      for (const [key, value] of Object.entries({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: scopes,
        state,
        nonce,
        code_challenge: await sha256(verifier),
        code_challenge_method: 'S256',
      }))
        authorization.searchParams.set(key, value);
      return redirect(authorization.toString());
    }
    if (url.pathname === '/callback') {
      const state = url.searchParams.get('state') ?? '';
      const transaction = transactions.get(state);
      transactions.delete(state);
      const metadata = await discovery();
      if (!transaction || url.searchParams.get('iss') !== metadata.issuer)
        return new Response('Invalid authorization response', { status: 400 });
      const tokenResponse = await fetch(metadata.token_endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: url.searchParams.get('code') ?? '',
          redirect_uri: redirectUri,
          code_verifier: transaction.verifier,
        }),
      });
      if (!tokenResponse.ok) return new Response('Token exchange failed', { status: 502 });
      const tokens = (await tokenResponse.json()) as {
        access_token: string;
        refresh_token?: string;
        id_token: string;
        expires_in: number;
      };
      await verifyIdToken(tokens.id_token, metadata, transaction.nonce);
      const sessionId = random();
      sessions.set(sessionId, {
        accessToken: tokens.access_token,
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
        idToken: tokens.id_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
      });
      return redirect(transaction.returnTo, sessionId);
    }
    const sessionId = cookie(request, 'bff_session');
    const session = sessionId ? sessions.get(sessionId) : undefined;
    if (!session)
      return redirect(`/login?returnTo=${encodeURIComponent(url.pathname + url.search)}`);
    if (url.pathname === '/logout') {
      sessions.delete(sessionId!);
      const metadata = await discovery();
      const logout = new URL(metadata.end_session_endpoint);
      logout.searchParams.set('id_token_hint', session.idToken);
      return redirect(logout.toString(), '');
    }
    const context = await fetch(`${issuer}/me/context`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    if (!context.ok) {
      sessions.delete(sessionId!);
      return redirect(`/login?returnTo=${encodeURIComponent(url.pathname + url.search)}`);
    }
    return Response.json(await context.json(), { headers: { 'Cache-Control': 'no-store' } });
  },
});

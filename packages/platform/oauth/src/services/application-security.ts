import { timingSafeEqual } from 'node:crypto';
import { OAuthApplicationError } from './application-contracts';

const CORE_SCOPES = new Set([
  'openid',
  'profile',
  'offline_access',
  'context',
  'roles.read',
  'departments.read',
  'permissions.read',
  'menus.read',
]);

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

export function randomOAuthValue(bytes: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function digestClientSecret(secret: string, pepper: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64url(
    new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(secret))),
  );
}

export async function verifyClientSecret(
  secret: string,
  expectedDigest: string,
  pepper: string,
): Promise<boolean> {
  const actual = Buffer.from(await digestClientSecret(secret, pepper));
  const expected = Buffer.from(expectedDigest);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function validateApplicationUrl(
  value: string,
  field: string,
  allowLoopbackHttp: boolean,
): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new OAuthApplicationError(`${field} 必须是完整 URL`);
  }
  if (url.username || url.password || url.hash)
    throw new OAuthApplicationError(`${field} 不能包含凭据或 fragment`);
  const loopback =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(allowLoopbackHttp && loopback && url.protocol === 'http:'))
    throw new OAuthApplicationError(`${field} 必须使用 HTTPS`);
  return url.toString();
}

export function validateApplicationScopes(
  scopes: string[],
  offlineAccessEnabled: boolean,
): string[] {
  const normalized = [...new Set(scopes)];
  if (!normalized.includes('openid'))
    throw new OAuthApplicationError('allowedScopes 必须包含 openid');
  if (normalized.some((scope) => !CORE_SCOPES.has(scope)))
    throw new OAuthApplicationError('allowedScopes 包含未注册的 Scope');
  if (normalized.includes('offline_access') && !offlineAccessEnabled)
    throw new OAuthApplicationError('启用 offline_access Scope 前必须允许离线访问');
  return normalized.sort();
}

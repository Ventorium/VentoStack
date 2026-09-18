import { describe, expect, test } from 'bun:test';
import type { Context } from '@ventostack/core';
import { createOAuthAdminCsrfMiddleware } from '../middlewares/admin-csrf';

function context(method: string, origin?: string, fetchSite?: string): Context {
  const headers = new Headers();
  if (origin) headers.set('Origin', origin);
  if (fetchSite) headers.set('Sec-Fetch-Site', fetchSite);
  return {
    request: new Request('https://id.example/api/oauth/admin', { method, headers }),
  } as Context;
}

describe('OAuth admin CSRF middleware', () => {
  const middleware = createOAuthAdminCsrfMiddleware('https://id.example/api/oauth');

  test('allows safe methods and same-origin writes', async () => {
    expect(await middleware(context('GET'), async () => new Response('ok'))).toHaveProperty(
      'status',
      200,
    );
    expect(
      await middleware(
        context('POST', 'https://id.example', 'same-origin'),
        async () => new Response('ok'),
      ),
    ).toHaveProperty('status', 200);
  });

  test('rejects missing or cross-origin write origins', async () => {
    expect(await middleware(context('POST'), async () => new Response('ok'))).toHaveProperty(
      'status',
      403,
    );
    expect(
      await middleware(
        context('DELETE', 'https://evil.example', 'cross-site'),
        async () => new Response('ok'),
      ),
    ).toHaveProperty('status', 403);
  });
});

import { describe, expect, test } from 'bun:test';
import type { SessionManager } from '@ventostack/auth';
import type { Context } from '@ventostack/core';
import { createRecentAuthenticationMiddleware } from '../middlewares/recent-auth';

function context(): Context {
  return {
    request: new Request('https://id.example/api/oauth/admin/applications/app/secret'),
    user: { id: 'user-1', sessionId: 'session-1', roles: ['admin'] },
  } as Context;
}

function sessions(authenticatedAt: unknown): SessionManager {
  return {
    get: async () => ({
      id: 'session-1',
      data: { userId: 'user-1', authenticatedAt },
      expiresAt: Date.now() + 60_000,
    }),
  } as unknown as SessionManager;
}

describe('OAuth recent authentication middleware', () => {
  test('allows a recently authenticated matching session', async () => {
    const middleware = createRecentAuthenticationMiddleware(sessions(Date.now()), 60_000);
    const response = await middleware(context(), async () => new Response('ok'));
    expect(response.status).toBe(200);
  });

  test('rejects stale and legacy sessions without authentication time', async () => {
    const stale = createRecentAuthenticationMiddleware(sessions(Date.now() - 61_000), 60_000);
    expect((await stale(context(), async () => new Response('ok'))).status).toBe(403);

    const legacy = createRecentAuthenticationMiddleware(sessions(undefined), 60_000);
    expect((await legacy(context(), async () => new Response('ok'))).status).toBe(403);
  });
});

import { describe, expect, test } from 'bun:test';
import type { Context } from '@ventostack/core';
import type { JWTManager } from '../jwt';
import { createAuthMiddleware } from '../middlewares/auth-guard';

function context(): Context {
  return {
    request: new Request('http://localhost/admin', {
      headers: { Authorization: 'Bearer valid-token' },
    }),
  } as Context;
}

const jwt = {
  verify: async () => ({ sub: 'u1', tenantId: 'tenant-a', roles: ['admin'] }),
} as unknown as JWTManager;

describe('createAuthMiddleware tenant boundary', () => {
  test('allows a token bound to the deployment tenant', async () => {
    const middleware = createAuthMiddleware(jwt, 'secret', 'tenant-a');
    const response = await middleware(context(), async () => new Response(null, { status: 204 }));
    expect(response.status).toBe(204);
  });

  test('rejects a token from another tenant', async () => {
    const middleware = createAuthMiddleware(jwt, 'secret', 'tenant-b');
    const response = await middleware(context(), async () => new Response(null, { status: 204 }));
    expect(response.status).toBe(401);
  });

  test('does not convert downstream failures into invalid-token responses', async () => {
    const middleware = createAuthMiddleware(jwt, 'secret', 'tenant-a');
    const downstreamError = new Error('handler failed');
    await expect(
      middleware(context(), async () => {
        throw downstreamError;
      }),
    ).rejects.toBe(downstreamError);
  });
});

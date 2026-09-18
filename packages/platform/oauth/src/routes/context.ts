import { createRouter } from '@ventostack/core';
import type { Context, Router } from '@ventostack/core';
import type { OAuthContextService } from '../services/context';

export function createOAuthContextRoutes(service: OAuthContextService): Router {
  const router = createRouter();
  const bearer = async (
    ctx: Context,
    operation: (token: string) => Promise<Record<string, unknown>>,
  ): Promise<Response> => {
    const authorization = ctx.request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer '))
      return Response.json(
        { error: 'invalid_token', error_description: '缺少 Bearer Access Token' },
        { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } },
      );
    try {
      return Response.json(await operation(authorization.slice(7)), {
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch (error) {
      const value = error as { error?: string; description?: string; status?: number };
      const status = value.status ?? 401;
      return Response.json(
        {
          error: value.error ?? 'invalid_token',
          error_description: value.description ?? 'Token 无效',
        },
        {
          status,
          headers: { 'WWW-Authenticate': `Bearer error="${value.error ?? 'invalid_token'}"` },
        },
      );
    }
  };
  router.get('/api/oauth/me/context', {}, (ctx) => bearer(ctx, service.get));
  router.get('/api/oauth/userinfo', {}, (ctx) => bearer(ctx, service.userInfo));
  router.post('/api/oauth/userinfo', {}, (ctx) => bearer(ctx, service.userInfo));
  return router;
}

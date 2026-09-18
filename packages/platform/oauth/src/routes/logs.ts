import { createRouter, pageOf, paginated } from '@ventostack/core';
import type { Middleware, Router } from '@ventostack/core';
import type { OAuthAuthLogService } from '../services/auth-log';

export function createOAuthLogRoutes(deps: {
  service: OAuthAuthLogService;
  authMiddleware: Middleware;
  perm: (resource: string, action: string) => Middleware;
}): Router {
  const router = createRouter();
  router.use(deps.authMiddleware);
  router.get(
    '/api/oauth/logs',
    {
      strict: true,
      query: {
        page: { type: 'int', min: 1, default: 1 },
        pageSize: { type: 'int', min: 1, max: 100, default: 10 },
        eventType: { type: 'string', max: 64 },
        success: { type: 'boolean' },
        clientId: { type: 'string', max: 64 },
        userId: { type: 'uuid' },
        startAt: { type: 'date' },
        endAt: { type: 'date' },
      },
      openapi: {
        summary: 'OAuth 认证日志',
        description: '仅返回当前认证租户日志。',
        tags: ['oauth'],
      },
    },
    async (ctx) => {
      const query = ctx.query as Record<string, unknown>;
      const { page, pageSize } = pageOf(query);
      const result = await deps.service.list({
        page,
        pageSize,
        ...(typeof query.eventType === 'string' ? { eventType: query.eventType } : {}),
        ...(typeof query.success === 'boolean' ? { success: query.success } : {}),
        ...(typeof query.clientId === 'string' ? { clientId: query.clientId } : {}),
        ...(typeof query.userId === 'string' ? { userId: query.userId } : {}),
        ...(query.startAt instanceof Date ? { startAt: query.startAt } : {}),
        ...(query.endAt instanceof Date ? { endAt: query.endAt } : {}),
      });
      return paginated(result.items, result.total, result.page, result.pageSize);
    },
    deps.perm('oauth:log', 'list'),
  );
  return router;
}

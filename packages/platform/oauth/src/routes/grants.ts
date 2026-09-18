import type { AuthUser } from '@ventostack/auth';
import { VentoStackError, createRouter, fail, success } from '@ventostack/core';
import type { Middleware, RouteSchemaConfig, Router } from '@ventostack/core';
import type { ApplicationGrants, OAuthGrantService } from '../services/grants';

function errorResponse(error: unknown): Response {
  if (error instanceof VentoStackError) throw error;
  return fail('授权配置失败', 400);
}

export function createOAuthGrantRoutes(deps: {
  service: OAuthGrantService;
  authMiddleware: Middleware;
  csrfMiddleware: Middleware;
  perm: (resource: string, action: string) => Middleware;
}): Router {
  const router = createRouter();
  router.use(deps.authMiddleware);
  router.use(deps.csrfMiddleware);

  router.get(
    '/api/oauth/admin/applications/:id/grants',
    { openapi: { summary: '查询当前租户的 Application 授权', tags: ['oauth'] } },
    async (ctx) => {
      try {
        return success(await deps.service.get((ctx.params as Record<string, string>).id!));
      } catch (error) {
        return errorResponse(error);
      }
    },
    deps.perm('oauth:grant', 'query'),
  );

  router.put(
    '/api/oauth/admin/applications/:id/grants',
    {
      strict: true,
      body: {
        roleIds: { type: 'array', required: true, min: 0, max: 100, items: { type: 'uuid' } },
        userIds: { type: 'array', required: true, min: 0, max: 100, items: { type: 'uuid' } },
        departments: {
          type: 'array',
          required: true,
          min: 0,
          max: 100,
          items: {
            type: 'object',
            properties: {
              deptId: { type: 'uuid', required: true },
              scope: {
                type: 'string',
                required: true,
                enum: ['SELF', 'SELF_AND_DESCENDANTS'],
              },
            },
          },
        },
      },
      openapi: {
        summary: '全量替换当前租户的 Application 授权',
        description: '租户由认证上下文确定，客户端不得提交 tenantId；跨租户主体按无效处理。',
        tags: ['oauth'],
      },
    } as RouteSchemaConfig,
    async (ctx) => {
      try {
        await deps.service.replace(
          (ctx.params as Record<string, string>).id!,
          ctx.body as unknown as ApplicationGrants,
        );
        return success(null);
      } catch (error) {
        return errorResponse(error);
      }
    },
    deps.perm('oauth:grant', 'update'),
  );

  router.get(
    '/api/oauth/portal/applications',
    {
      strict: true,
      query: { search: { type: 'string', max: 128 } },
      openapi: { summary: '当前用户可访问的 Application 门户列表', tags: ['oauth'] },
    },
    async (ctx) => {
      const user = ctx.user as AuthUser | undefined;
      if (!user) return fail('未登录', 401, 401);
      const search = typeof ctx.query.search === 'string' ? ctx.query.search.trim() : undefined;
      return success(await deps.service.portal(user, search));
    },
  );

  return router;
}

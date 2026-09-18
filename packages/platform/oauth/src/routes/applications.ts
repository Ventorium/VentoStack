import {
  VentoStackError,
  createRouter,
  fail,
  pageOf,
  paginated,
  parseBody,
  safeErrorMessage,
  success,
} from '@ventostack/core';
import type { Middleware, RouteSchemaConfig, Router } from '@ventostack/core';
import type {
  CreateApplicationParams,
  OAuthApplicationService,
  UpdateApplicationParams,
} from '../services/application';

const urlField = { type: 'string' as const, max: 2048 };
const applicationBody = {
  name: { type: 'string' as const, required: true, min: 1, max: 128 },
  description: { type: 'string' as const, max: 512 },
  homepageUrl: { ...urlField, required: true },
  redirectUri: { ...urlField, required: true },
  postLogoutRedirectUri: urlField,
  backchannelLogoutUri: urlField,
  backchannelLogoutSessionRequired: { type: 'boolean' as const },
  allowedScopes: {
    type: 'array' as const,
    required: true,
    items: { type: 'string' as const },
    min: 1,
    max: 8,
  },
  offlineAccessEnabled: { type: 'boolean' as const },
  enabled: { type: 'boolean' as const },
  sort: { type: 'int' as const, min: 0, max: 9999 },
};

const adminDescription = '全局 OAuth 客户端控制面；除权限校验外，还要求数据库实时平台管理员身份。';

function handleError(error: unknown, fallback: string): Response {
  if (error instanceof VentoStackError) throw error;
  return fail(safeErrorMessage(error, fallback), 400);
}

export function createOAuthApplicationRoutes(deps: {
  service: OAuthApplicationService;
  authMiddleware: Middleware;
  platformAdminMiddleware: Middleware;
  csrfMiddleware: Middleware;
  recentAuthMiddleware: Middleware;
  perm: (resource: string, action: string) => Middleware;
}): Router {
  const router = createRouter();
  router.use(deps.authMiddleware);
  router.use(deps.platformAdminMiddleware);
  router.use(deps.csrfMiddleware);

  router.get(
    '/api/oauth/admin/applications',
    {
      strict: true,
      query: {
        page: { type: 'int', min: 1, default: 1 },
        pageSize: { type: 'int', min: 1, max: 100, default: 10 },
        name: { type: 'string', max: 128 },
        status: { type: 'string', enum: ['ACTIVE', 'DISABLED'] },
      },
      openapi: {
        summary: 'OAuth Application 列表',
        description: adminDescription,
        tags: ['oauth'],
      },
    },
    async (ctx) => {
      const query = ctx.query as Record<string, unknown>;
      const { page, pageSize } = pageOf(query);
      const result = await deps.service.list({
        page,
        pageSize,
        ...(typeof query.name === 'string' ? { name: query.name } : {}),
        ...(typeof query.status === 'string' ? { status: query.status } : {}),
      });
      return paginated(result.items, result.total, result.page, result.pageSize);
    },
    deps.perm('oauth:application', 'list'),
  );

  router.get(
    '/api/oauth/admin/applications/:id',
    {
      openapi: {
        summary: 'OAuth Application 详情',
        description: adminDescription,
        tags: ['oauth'],
      },
    },
    async (ctx) => {
      const item = await deps.service.getById((ctx.params as Record<string, string>).id!);
      return item ? success(item) : fail('Application 不存在', 404, 404);
    },
    deps.perm('oauth:application', 'query'),
  );

  router.post(
    '/api/oauth/admin/applications',
    {
      strict: true,
      body: {
        identifier: {
          type: 'string',
          required: true,
          min: 2,
          max: 64,
          pattern: /^[a-z][a-z0-9_-]*$/,
        },
        ...applicationBody,
      },
      openapi: {
        summary: '注册 OAuth Application',
        description: `${adminDescription} clientSecret 仅在本次响应展示。`,
        tags: ['oauth'],
      },
    } as RouteSchemaConfig,
    async (ctx) => {
      try {
        return success(
          await deps.service.create((await parseBody(ctx.request)) as CreateApplicationParams),
        );
      } catch (error) {
        return handleError(error, '注册 Application 失败');
      }
    },
    deps.perm('oauth:application', 'create'),
  );

  router.put(
    '/api/oauth/admin/applications/:id',
    {
      strict: true,
      body: Object.fromEntries(
        Object.entries(applicationBody).map(([key, value]) => [key, { ...value, required: false }]),
      ),
      openapi: {
        summary: '更新 OAuth Application',
        description: adminDescription,
        tags: ['oauth'],
      },
    } as RouteSchemaConfig,
    async (ctx) => {
      try {
        await deps.service.update(
          (ctx.params as Record<string, string>).id!,
          (await parseBody(ctx.request)) as UpdateApplicationParams,
        );
        return success(null);
      } catch (error) {
        return handleError(error, '更新 Application 失败');
      }
    },
    deps.perm('oauth:application', 'update'),
  );

  router.post(
    '/api/oauth/admin/applications/:id/secret',
    {
      openapi: {
        summary: '重新生成 Client Secret',
        description: `${adminDescription} 旧 Secret 立即失效，新 Secret 仅展示一次。`,
        tags: ['oauth'],
      },
    },
    async (ctx) => {
      try {
        return success(
          await deps.service.regenerateSecret((ctx.params as Record<string, string>).id!),
        );
      } catch (error) {
        return handleError(error, '重新生成 Secret 失败');
      }
    },
    deps.perm('oauth:application', 'secret'),
    deps.recentAuthMiddleware,
  );

  router.delete(
    '/api/oauth/admin/applications/:id',
    {
      openapi: {
        summary: '永久删除 OAuth Application',
        description: `${adminDescription} 唯一标识以 tombstone 保留且不可复用。`,
        tags: ['oauth'],
      },
    },
    async (ctx) => {
      try {
        await deps.service.delete((ctx.params as Record<string, string>).id!);
        return success(null);
      } catch (error) {
        return handleError(error, '删除 Application 失败');
      }
    },
    deps.perm('oauth:application', 'delete'),
    deps.recentAuthMiddleware,
  );

  return router;
}

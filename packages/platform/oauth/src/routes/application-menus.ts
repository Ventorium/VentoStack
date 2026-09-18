import { VentoStackError, createRouter, fail, success } from '@ventostack/core';
import type { Middleware, RouteSchemaConfig, Router } from '@ventostack/core';
import type {
  ApplicationMenuInput,
  OAuthApplicationMenuService,
} from '../services/application-menu';

const body = {
  parentId: { type: 'uuid' as const },
  name: { type: 'string' as const, required: true, min: 1, max: 64 },
  path: { type: 'string' as const, max: 256 },
  component: { type: 'string' as const, max: 256 },
  redirect: { type: 'string' as const, max: 256 },
  type: { type: 'int' as const, required: true, enum: [1, 2, 3] },
  permission: { type: 'string' as const, max: 128 },
  icon: { type: 'string' as const, max: 64 },
  sort: { type: 'int' as const, required: true, min: 0, max: 9999 },
  visible: { type: 'boolean' as const, required: true },
  status: { type: 'int' as const, required: true, enum: [0, 1] },
  roleIds: {
    type: 'array' as const,
    required: true,
    min: 0,
    max: 100,
    items: { type: 'uuid' as const },
  },
};

function handle(error: unknown): Response {
  if (error instanceof VentoStackError) throw error;
  return fail('Application 菜单操作失败', 400);
}

export function createOAuthApplicationMenuRoutes(deps: {
  service: OAuthApplicationMenuService;
  authMiddleware: Middleware;
  csrfMiddleware: Middleware;
  perm: (resource: string, action: string) => Middleware;
}): Router {
  const router = createRouter();
  router.use(deps.authMiddleware);
  router.use(deps.csrfMiddleware);
  router.get(
    '/api/oauth/admin/applications/:applicationId/menus',
    {},
    async (ctx) => {
      try {
        return success(await deps.service.list(ctx.params.applicationId));
      } catch (error) {
        return handle(error);
      }
    },
    deps.perm('oauth:menu', 'list'),
  );
  router.post(
    '/api/oauth/admin/applications/:applicationId/menus',
    { strict: true, body } as RouteSchemaConfig,
    async (ctx) => {
      try {
        return success(
          await deps.service.create(
            ctx.params.applicationId,
            ctx.body as unknown as ApplicationMenuInput,
          ),
        );
      } catch (error) {
        return handle(error);
      }
    },
    deps.perm('oauth:menu', 'create'),
  );
  router.put(
    '/api/oauth/admin/applications/:applicationId/menus/:id',
    { strict: true, body } as RouteSchemaConfig,
    async (ctx) => {
      try {
        await deps.service.update(
          ctx.params.applicationId,
          ctx.params.id,
          ctx.body as unknown as ApplicationMenuInput,
        );
        return success(null);
      } catch (error) {
        return handle(error);
      }
    },
    deps.perm('oauth:menu', 'update'),
  );
  router.delete(
    '/api/oauth/admin/applications/:applicationId/menus/:id',
    {},
    async (ctx) => {
      try {
        await deps.service.delete(ctx.params.applicationId, ctx.params.id);
        return success(null);
      } catch (error) {
        return handle(error);
      }
    },
    deps.perm('oauth:menu', 'delete'),
  );
  return router;
}

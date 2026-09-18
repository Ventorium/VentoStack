import { createRouter, fail, safeErrorMessage, success } from '@ventostack/core';
import type { Middleware, Router } from '@ventostack/core';
import type { OAuthApplicationService } from '../services/application';

const MAX_ICON_SIZE = 2 * 1024 * 1024;

export function createOAuthIconRoutes(deps: {
  service: OAuthApplicationService;
  authMiddleware: Middleware;
  platformAdminMiddleware: Middleware;
  csrfMiddleware: Middleware;
  perm: (resource: string, action: string) => Middleware;
}): Router {
  const router = createRouter();
  router.get('/api/oauth/applications/:id/icon', {}, async (ctx) => {
    const icon = await deps.service.readIcon(ctx.params.id);
    if (!icon) return fail('Icon 不存在', 404, 404);
    return new Response(icon.stream, {
      headers: {
        'Content-Type': icon.mimeType,
        'Cache-Control': 'public, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
  const admin = createRouter();
  admin.use(deps.authMiddleware);
  admin.use(deps.platformAdminMiddleware);
  admin.use(deps.csrfMiddleware);
  admin.post(
    '/api/oauth/admin/applications/:id/icon',
    {
      formData: {
        file: { type: 'file' as const, required: true, maxSize: MAX_ICON_SIZE },
      },
    },
    async (ctx) => {
      try {
        const formData = await ctx.request.formData();
        const file = formData.get('file');
        if (!(file instanceof File)) return fail('缺少 Icon 文件', 400);
        if (file.size > MAX_ICON_SIZE) return fail('Icon 不能超过 2MB', 400);
        return success(
          await deps.service.uploadIcon(
            ctx.params.id,
            file.name,
            Buffer.from(await file.arrayBuffer()),
          ),
        );
      } catch (error) {
        return fail(safeErrorMessage(error, 'Icon 上传失败'), 400);
      }
    },
    deps.perm('oauth:application', 'update'),
  );
  router.merge(admin);
  return router;
}

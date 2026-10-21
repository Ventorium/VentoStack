/**
 * 专家管理路由
 * 市场浏览/搜索 + 安装（批量）/已安装 CRUD/同步升级
 */
import {
  createRouter,
  fail,
  handleError,
  pageOf,
  paginated,
  parseBody,
  success,
} from '@ventostack/core';
import type { Middleware, Router } from '@ventostack/core';
import type { createExpertService } from '../services/expert';

type ExpertSvc = ReturnType<typeof createExpertService>;

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,127}$/;

export function createExpertRoutes(
  expertService: ExpertSvc,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  function tenantOf(ctx: { user?: unknown }): string {
    return (ctx.user as { tenantId?: string })?.tenantId ?? 'default';
  }

  // ── 市场浏览（manifest 缓存） ──
  router.get('/api/ai/experts/hub/manifest', perm('ai:expert', 'list'), async (ctx) => {
    try {
      const q = ctx.query as Record<string, unknown>;
      const result = await expertService.listRemote({
        keyword: (q.keyword as string) || undefined,
        categoryId: (q.categoryId as string) || undefined,
      });
      return success(result);
    } catch (e) {
      return handleError(e);
    }
  });

  // ── 批量安装 ──
  router.post('/api/ai/experts/hub/install', perm('ai:expert', 'create'), async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const slugs = body.slugs;
      if (!Array.isArray(slugs) || slugs.length === 0 || slugs.length > 50) {
        return fail('slugs 必须为 1..50 的数组', 400, 400);
      }
      for (const slug of slugs) {
        if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
          return fail(`非法 slug：${String(slug)}`, 400, 400);
        }
      }
      const result = await expertService.installBatch(slugs as string[], tenantOf(ctx));
      return success(result);
    } catch (e) {
      return handleError(e);
    }
  });

  // ── 已安装列表 ──
  router.get('/api/ai/experts', perm('ai:expert', 'list'), async (ctx) => {
    try {
      const q = ctx.query as Record<string, unknown>;
      const { page, pageSize } = pageOf(q);
      const categoryId = (q.categoryId as string) || undefined;
      const enabled =
        q.enabled !== undefined ? q.enabled === 'true' || q.enabled === true : undefined;
      const result = await expertService.list(tenantOf(ctx), {
        categoryId,
        enabled,
        page,
        pageSize,
      });
      return paginated(result.list, result.total, page, pageSize);
    } catch (e) {
      return handleError(e);
    }
  });

  // ── 已安装详情 ──
  router.get('/api/ai/experts/:id', perm('ai:expert', 'query'), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const record = await expertService.getById(id, tenantOf(ctx));
    if (!record) return fail('专家不存在', 404, 404);
    return success(record);
  });

  // ── 启用/禁用 ──
  router.put('/api/ai/experts/:id', perm('ai:expert', 'update'), async (ctx) => {
    try {
      const id = (ctx.params as Record<string, string>).id!;
      const body = await parseBody(ctx.request);
      if (typeof body.enabled !== 'boolean') return fail('enabled 必须为布尔值', 400, 400);
      await expertService.setEnabled(id, tenantOf(ctx), body.enabled);
      return success(null);
    } catch (e) {
      return handleError(e);
    }
  });

  // ── 卸载 ──
  router.delete('/api/ai/experts/:id', perm('ai:expert', 'delete'), async (ctx) => {
    try {
      const id = (ctx.params as Record<string, string>).id!;
      await expertService.uninstall(id, tenantOf(ctx));
      return success(null);
    } catch (e) {
      return handleError(e);
    }
  });

  // ── 批量检查更新 ──
  router.post('/api/ai/experts/check-updates', perm('ai:expert', 'list'), async (ctx) => {
    try {
      const updates = await expertService.checkUpdates(tenantOf(ctx));
      return success({ updates, count: updates.length });
    } catch (e) {
      return handleError(e);
    }
  });

  // ── 升级 ──
  router.post('/api/ai/experts/:id/upgrade', perm('ai:expert', 'update'), async (ctx) => {
    try {
      const id = (ctx.params as Record<string, string>).id!;
      const result = await expertService.upgrade(id, tenantOf(ctx));
      return success(result);
    } catch (e) {
      return handleError(e);
    }
  });

  // ── 一键实例化为 Agent ──
  router.post('/api/ai/experts/:id/instantiate', perm('ai:expert', 'create'), async (ctx) => {
    try {
      const id = (ctx.params as Record<string, string>).id!;
      const body = await parseBody(ctx.request);
      const userId = (ctx.user as { id?: string })?.id ?? '';
      if (!userId) return fail('需要认证用户', 401, 401);
      const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : undefined;
      const model = Array.isArray(body.model)
        ? body.model.filter((m): m is string => typeof m === 'string' && m.length > 0)
        : undefined;
      const result = await expertService.instantiate(id, tenantOf(ctx), {
        createdBy: userId,
        ...(name ? { name } : {}),
        ...(model && model.length > 0 ? { model } : {}),
      });
      return success(result);
    } catch (e) {
      return handleError(e);
    }
  });

  return router;
}

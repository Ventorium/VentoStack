/**
 * AI 供应商与模型管理路由
 */
import { createRouter, fail, handleError, parseBody, success } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import { getPresets } from "../services/provider-presets";
import type { createProviderService } from "../services/provider";

type ProviderService = ReturnType<typeof createProviderService>;

export function createProviderRoutes(
  providerService: ProviderService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  // === 预设列表（无需登录也可查看）===
  router.get("/api/ai/providers/presets", async () => {
    return success(getPresets());
  });

  // === 供应商 CRUD ===

  router.get(
    "/api/ai/providers",
    perm("ai:provider", "list"),
    async (ctx) => {
      const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
      const providers = await providerService.listProviders(tenantId);
      return success(providers);
    },
  );

  router.get(
    "/api/ai/providers/:id",
    perm("ai:provider", "query"),
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
      const provider = await providerService.getProviderById(id, tenantId);
      if (!provider) return fail("供应商不存在", 404, 404);
      return success(provider);
    },
  );

  router.post(
    "/api/ai/providers",
    perm("ai:provider", "create"),
    async (ctx) => {
      try {
        const body = await parseBody(ctx.request);
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const result = await providerService.createProvider(tenantId, {
          name: body.name as string,
          displayName: body.displayName as string | undefined,
          apiFormat: body.apiFormat as string,
          baseUrl: body.baseUrl as string,
          apiKey: body.apiKey as string,
          headers: body.headers as Record<string, string> | undefined,
          extra: body.extra as Record<string, unknown> | undefined,
          presetId: body.presetId as string | undefined,
          sort: body.sort as number | undefined,
        });
        return success(result);
      } catch (e) {
        return handleError(e);
      }
    },
  );

  router.put(
    "/api/ai/providers/:id",
    perm("ai:provider", "update"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const body = await parseBody(ctx.request);
        await providerService.updateProvider(id, tenantId, body as Parameters<typeof providerService.updateProvider>[2]);
        return success(null);
      } catch (e) {
        return handleError(e);
      }
    },
  );

  router.delete(
    "/api/ai/providers/:id",
    perm("ai:provider", "delete"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        await providerService.deleteProvider(id, tenantId);
        return success(null);
      } catch (e) {
        return handleError(e);
      }
    },
  );

  // === 模型管理 ===

  router.get(
    "/api/ai/providers/:id/models",
    perm("ai:provider", "query"),
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
      const models = await providerService.listModels(id, tenantId);
      return success(models);
    },
  );

  router.put(
    "/api/ai/models/:id",
    perm("ai:provider", "update"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const body = await parseBody(ctx.request);
        await providerService.updateModel(id, tenantId, body as Parameters<typeof providerService.updateModel>[2]);
        return success(null);
      } catch (e) {
        return handleError(e);
      }
    },
  );

  // 从 models.dev 同步模型
  router.post(
    "/api/ai/providers/:id/sync",
    perm("ai:provider", "update"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const result = await providerService.syncModels(id, tenantId);
        return success(result);
      } catch (e) {
        return handleError(e);
      }
    },
  );

  // === 全局模型列表（给对话用）===
  router.get(
    "/api/ai/models",
    perm("ai:provider", "list"),
    async (ctx) => {
      const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
      const models = await providerService.listAllModels(tenantId);
      return success(models);
    },
  );

  // === AI 全局配置 ===

  router.get(
    "/api/ai/config/:key",
    perm("ai:provider", "query"),
    async (ctx) => {
      const key = (ctx.params as Record<string, string>).key!;
      const value = await providerService.getConfig(key);
      return success({ key, value });
    },
  );

  router.put(
    "/api/ai/config/:key",
    perm("ai:provider", "update"),
    async (ctx) => {
      try {
        const key = (ctx.params as Record<string, string>).key!;
        const body = await parseBody(ctx.request);
        await providerService.setConfig(key, body.value as string);
        return success(null);
      } catch (e) {
        return handleError(e);
      }
    },
  );

  return router;
}

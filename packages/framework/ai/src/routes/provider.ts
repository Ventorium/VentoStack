/**
 * AI 供应商与模型管理路由
 */
import { createRouter, fail, handleError, parseBody, success } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import { getPresets } from "../services/provider-presets";
import type { createProviderService } from "../services/provider";
import { routeDoc } from "./schema";

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
    routeDoc("获取供应商列表"),
    async (ctx) => {
      const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
      const providers = await providerService.listProviders(tenantId);
      return success(providers);
    },
    perm("ai:provider", "list"),
  );

  router.get(
    "/api/ai/providers/:id",
    routeDoc("获取供应商详情"),
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
      const provider = await providerService.getProviderById(id, tenantId);
      if (!provider) return fail("供应商不存在", 404, 404);
      return success(provider);
    },
    perm("ai:provider", "query"),
  );

  router.post(
    "/api/ai/providers",
    routeDoc("创建供应商", {
      body: {
        name: { type: "string", required: true, description: "供应商名称" },
        displayName: { type: "string", description: "显示名称" },
        apiFormat: { type: "string", description: "API 格式" },
        baseUrl: { type: "string", description: "Base URL" },
        apiKey: { type: "string", description: "API Key（加密存储）" },
      },
    }),
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
          modelsDevSlug: body.modelsDevSlug as string | undefined,
          sort: body.sort as number | undefined,
        });
        return success(result);
      } catch (e) {
        return handleError(e);
      }
    },
    perm("ai:provider", "create"),
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

  router.delete(
    "/api/ai/models/:id",
    perm("ai:provider", "delete"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        await providerService.deleteModel(id, tenantId);
        return success(null);
      } catch (e) {
        return handleError(e);
      }
    },
  );

  // 创建模型（手动添加）
  router.post(
    "/api/ai/providers/:id/models",
    perm("ai:provider", "create"),
    async (ctx) => {
      try {
        const providerId = (ctx.params as Record<string, string>).id!;
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const body = await parseBody(ctx.request);
        const result = await providerService.createModel(tenantId, {
          providerId,
          modelId: body.modelId as string,
          displayName: body.displayName as string | undefined,
          contextLength: body.contextLength as number | undefined,
          maxOutputTokens: body.maxOutputTokens as number | undefined,
          supportsText: body.supportsText as boolean | undefined,
          supportsImage: body.supportsImage as boolean | undefined,
          supportsVideo: body.supportsVideo as boolean | undefined,
          supportsAudio: body.supportsAudio as boolean | undefined,
          supportsFunctionCalling: body.supportsFunctionCalling as boolean | undefined,
          supportsStreaming: body.supportsStreaming as boolean | undefined,
          supportsThinking: body.supportsThinking as boolean | undefined,
          supportsStructuredOutput: body.supportsStructuredOutput as boolean | undefined,
          reasoningOptions: body.reasoningOptions as Parameters<typeof providerService.createModel>[1]["reasoningOptions"],
          pricingInput: body.pricingInput as number | null | undefined,
          pricingOutput: body.pricingOutput as number | null | undefined,
          status: body.status as number | undefined,
          sort: body.sort as number | undefined,
        });
        return success(result);
      } catch (e) {
        return handleError(e);
      }
    },
  );

  // 批量删除模型
  router.post(
    "/api/ai/models/batch-delete",
    perm("ai:provider", "delete"),
    async (ctx) => {
      try {
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const body = await parseBody(ctx.request);
        const ids = body.ids as string[];
        if (!ids || !Array.isArray(ids) || ids.length === 0) return fail("请选择要删除的模型", 400, 400);
        const count = await providerService.deleteModels(ids, tenantId);
        return success({ deleted: count });
      } catch (e) {
        return handleError(e);
      }
    },
  );

  // 测试模型连通性
  router.post(
    "/api/ai/models/:id/test",
    perm("ai:provider", "query"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const model = await providerService.getModel(id, tenantId);
        if (!model) return fail("模型不存在", 404, 404);

        const provider = await providerService.getProviderApiKey(model.providerId, tenantId);
        if (!provider) return fail("供应商不存在", 404, 404);

        const startTime = Date.now();

        // Build request based on API format
        let url: string;
        let headers: Record<string, string>;
        let body: Record<string, unknown>;

        if (provider.apiFormat === "anthropic") {
          url = `${provider.baseUrl.replace(/\/+$/, "")}/messages`;
          headers = {
            "Content-Type": "application/json",
            "x-api-key": provider.apiKey,
            "anthropic-version": "2023-06-01",
          };
          body = {
            model: model.modelId,
            max_tokens: 1,
            messages: [{ role: "user", content: "1+1=?" }],
          };
        } else {
          // openai_chat / openai_response / custom
          const endpoint = provider.apiFormat === "openai_response" ? "responses" : "chat/completions";
          url = `${provider.baseUrl.replace(/\/+$/, "")}/${endpoint}`;
          headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${provider.apiKey}`,
          };
          body = {
            model: model.modelId,
            max_tokens: 1,
            messages: [{ role: "user", content: "1+1=?" }],
          };
        }

        const resp = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30000),
        });

        const elapsed = Date.now() - startTime;

        if (resp.ok) {
          return success({ status: "ok", statusCode: resp.status, elapsed });
        } else {
          const text = await resp.text().catch(() => "");
          return success({ status: "error", statusCode: resp.status, elapsed, message: text.slice(0, 200) });
        }
      } catch (e) {
        return success({ status: "error", message: e instanceof Error ? e.message : "连接失败" });
      }
    },
  );

  // 批量测试模型连通性
  router.post(
    "/api/ai/models/batch-test",
    perm("ai:provider", "query"),
    async (ctx) => {
      try {
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const body = await parseBody(ctx.request);
        const ids = body.ids as string[];
        if (!ids || !Array.isArray(ids) || ids.length === 0) return fail("请选择要测试的模型", 400, 400);

        const results: Array<{ id: string; status: string; elapsed?: number; message?: string }> = [];

        // Test sequentially to avoid rate limiting
        for (const id of ids) {
          const model = await providerService.getModel(id, tenantId);
          if (!model) { results.push({ id, status: "error", message: "模型不存在" }); continue; }

          const provider = await providerService.getProviderApiKey(model.providerId, tenantId);
          if (!provider) { results.push({ id, status: "error", message: "供应商不存在" }); continue; }

          try {
            const startTime = Date.now();
            let url: string;
            let headers: Record<string, string>;
            let reqBody: Record<string, unknown>;

            if (provider.apiFormat === "anthropic") {
              url = `${provider.baseUrl.replace(/\/+$/, "")}/messages`;
              headers = {
                "Content-Type": "application/json",
                "x-api-key": provider.apiKey,
                "anthropic-version": "2023-06-01",
              };
              reqBody = {
                model: model.modelId,
                max_tokens: 1,
                messages: [{ role: "user", content: "1+1=?" }],
              };
            } else {
              const endpoint = provider.apiFormat === "openai_response" ? "responses" : "chat/completions";
              url = `${provider.baseUrl.replace(/\/+$/, "")}/${endpoint}`;
              headers = {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${provider.apiKey}`,
              };
              reqBody = {
                model: model.modelId,
                max_tokens: 1,
                messages: [{ role: "user", content: "1+1=?" }],
              };
            }

            const resp = await fetch(url, {
              method: "POST",
              headers,
              body: JSON.stringify(reqBody),
              signal: AbortSignal.timeout(30000),
            });

            const elapsed = Date.now() - startTime;

            if (resp.ok) {
              results.push({ id, status: "ok", elapsed });
            } else {
              const text = await resp.text().catch(() => "");
              results.push({ id, status: "error", elapsed, message: `HTTP ${resp.status}: ${text.slice(0, 100)}` });
            }
          } catch (e) {
            results.push({ id, status: "error", message: e instanceof Error ? e.message : "连接失败" });
          }
        }

        return success(results);
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
    routeDoc("获取全局模型列表"),
    async (ctx) => {
      const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
      const models = await providerService.listAllModels(tenantId);
      return success(models);
    },
    perm("ai:provider", "list"),
  );

  // === AI 全局配置 ===

  router.get(
    "/api/ai/config/:key",
    routeDoc("获取 AI 全局配置"),
    async (ctx) => {
      const key = (ctx.params as Record<string, string>).key!;
      const value = await providerService.getConfig(key);
      return success({ key, value });
    },
    perm("ai:provider", "query"),
  );

  router.put(
    "/api/ai/config/:key",
    routeDoc("设置 AI 全局配置", {
      body: {
        value: { type: "string", required: true, description: "配置值" },
      },
    }),
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
    perm("ai:provider", "update"),
  );

  return router;
}

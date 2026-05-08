/**
 * @ventostack/i18n - 国际化路由
 */

import { createRouter } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import type { I18nService } from "../services/i18n";
import { ok, okPage, fail, parseBody, pageOf } from "./common";

export function createI18nRoutes(
  i18nService: I18nService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  // === Locale CRUD ===

  router.post("/api/i18n/locales", perm("i18n", "locale:create"), async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const result = await i18nService.createLocale({
        code: body.code as string,
        name: body.name as string,
        isDefault: body.isDefault as boolean | undefined,
      });
      return ok(result);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "创建失败", 400);
    }
  });

  router.get("/api/i18n/locales", perm("i18n", "locale:list"), async () => {
    const locales = await i18nService.listLocales();
    return ok(locales);
  });

  router.put("/api/i18n/locales/:id", perm("i18n", "locale:update"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const body = await parseBody(ctx.request);
    await i18nService.updateLocale(id, body);
    return ok(null);
  });

  router.delete("/api/i18n/locales/:id", perm("i18n", "locale:delete"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    await i18nService.deleteLocale(id);
    return ok(null);
  });

  // === Message CRUD ===

  router.get("/api/i18n/messages", perm("i18n", "message:list"), async (ctx) => {
    const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
    const q = ctx.query as Record<string, unknown>;
    const result = await i18nService.listMessages({
      locale: q.locale as string | undefined,
      module: q.module as string | undefined,
      page,
      pageSize,
    });
    return okPage(result.items, result.total, result.page, result.pageSize);
  });

  router.get("/api/i18n/messages/:locale", perm("i18n", "message:query"), async (ctx) => {
    const locale = (ctx.params as Record<string, string>).locale!;
    const q = ctx.query as Record<string, unknown>;
    const messages = await i18nService.getLocaleMessages(locale, q.module as string | undefined);
    return ok(messages);
  });

  router.post("/api/i18n/messages/set", perm("i18n", "message:create"), async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      await i18nService.setMessage(
        body.locale as string,
        body.code as string,
        body.value as string,
        body.module as string | undefined,
      );
      return ok(null);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "设置失败", 400);
    }
  });

  router.post("/api/i18n/messages/import", perm("i18n", "message:create"), async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const count = await i18nService.importMessages(
        body.locale as string,
        body.messages as Record<string, string>,
        body.module as string | undefined,
      );
      return ok({ count });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "导入失败", 400);
    }
  });

  router.delete("/api/i18n/messages/:id", perm("i18n", "message:delete"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    await i18nService.deleteMessage(id);
    return ok(null);
  });

  return router;
}

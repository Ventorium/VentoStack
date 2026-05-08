/**
 * Routes 代码模板
 */

import type { GenTableInfo, GenColumnInfo } from "../services/gen";

export function renderRoutes(table: GenTableInfo, _columns: GenColumnInfo[]): string {
  const basePath = `/api/${table.moduleName}/${toPlural(table.className.toLowerCase())}`;
  const permPrefix = `${table.moduleName}:${table.className.toLowerCase()}`;

  return `import { createRouter } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import type { ${table.className}Service } from "../services/${toKebab(table.className)}";
import { ok, okPage, fail, parseBody, pageOf } from "./common";

export function create${table.className}Routes(
  service: ${table.className}Service,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  router.get("${basePath}", perm("${permPrefix}", "list"), async (ctx) => {
    const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
    const result = await service.list({ ...(ctx.query as Record<string, unknown>), page, pageSize });
    return okPage(result.items, result.total, result.page, result.pageSize);
  });

  router.get("${basePath}/:id", perm("${permPrefix}", "query"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id;
    const item = await service.getById(id);
    if (!item) return fail("资源不存在", 404, 404);
    return ok(item);
  });

  router.post("${basePath}", perm("${permPrefix}", "create"), async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const result = await service.create(body as any);
      return ok(result);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "创建失败", 400);
    }
  });

  router.put("${basePath}/:id", perm("${permPrefix}", "update"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id;
    const body = await parseBody(ctx.request);
    await service.update(id, body as any);
    return ok(null);
  });

  router.delete("${basePath}/:id", perm("${permPrefix}", "delete"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id;
    await service.delete(id);
    return ok(null);
  });

  return router;
}
`;
}

function toKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

function toPlural(str: string): string {
  if (str.endsWith("y") && !/[aeiou]y$/.test(str)) return str.slice(0, -1) + "ies";
  if (str.endsWith("s")) return str;
  return str + "s";
}

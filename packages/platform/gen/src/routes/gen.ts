/**
 * @ventostack/gen - 代码生成路由
 */

import { createRouter } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import type { GenService } from "../services/gen";
import { ok, okPage, fail, parseBody, pageOf } from "./common";

export function createGenRoutes(
  genService: GenService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  // List imported tables
  router.get("/api/gen/tables", perm("gen", "table:list"), async (ctx) => {
    const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
    const result = await genService.listTables({ page, pageSize });
    return okPage(result.items, result.total, result.page, result.pageSize);
  });

  // Import a DB table
  router.post("/api/gen/tables/import", perm("gen", "table:create"), async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const result = await genService.importTable(
        body.tableName as string,
        body.moduleName as string,
        body.author as string | undefined,
      );
      return ok(result);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "导入失败", 400);
    }
  });

  // Get table detail
  router.get("/api/gen/tables/:id", perm("gen", "table:query"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const table = await genService.getTable(id);
    if (!table) return fail("表不存在", 404, 404);
    const columns = await genService.getColumns(id);
    return ok({ ...table, columns });
  });

  // Update table config
  router.put("/api/gen/tables/:id", perm("gen", "table:update"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const body = await parseBody(ctx.request);
    await genService.updateTable(id, body as any);
    return ok(null);
  });

  // Update column config
  router.put("/api/gen/columns/:id", perm("gen", "table:update"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const body = await parseBody(ctx.request);
    await genService.updateColumn(id, body as any);
    return ok(null);
  });

  // Preview generated code
  router.get("/api/gen/tables/:id/preview", perm("gen", "table:query"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    try {
      const files = await genService.preview(id);
      return ok(files);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "预览失败", 400);
    }
  });

  // Generate code
  router.post("/api/gen/tables/:id/generate", perm("gen", "table:generate"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    try {
      const files = await genService.generate(id);
      return ok(files);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "生成失败", 400);
    }
  });

  return router;
}

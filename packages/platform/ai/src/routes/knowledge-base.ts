/**
 * 知识库路由
 */
import { createRouter } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import type { KnowledgeBaseService } from "../knowledge-base/types";
import { fail, ok, okPage, handleError, parseBody, pageOf } from "./common";

export function createKnowledgeBaseRoutes(
  kbService: KnowledgeBaseService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  // 知识库 CRUD
  router.post(
    "/api/ai/knowledge-bases",
    perm("ai:knowledge-base", "create"),
    async (ctx) => {
      try {
        const body = await parseBody(ctx.request);
        const userId = (ctx.user as { id?: string })?.id ?? "";
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "";
        const result = await kbService.create({
          name: body.name as string,
          description: body.description as string | undefined,
          tenantId,
          userId,
        });
        return ok(result);
      } catch (e) {
        return handleError(e);
      }
    },
  );

  router.get(
    "/api/ai/knowledge-bases",
    perm("ai:knowledge-base", "list"),
    async (ctx) => {
      const { page, pageSize } = pageOf(
        ctx.query as Record<string, unknown>,
      );
      const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "";
      const result = await kbService.list({ tenantId, page, pageSize });
      return okPage(result.list, result.total, page, pageSize);
    },
  );

  router.get(
    "/api/ai/knowledge-bases/:id",
    perm("ai:knowledge-base", "list"),
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "";
      const kb = await kbService.getById(id, tenantId);
      if (!kb) return fail("知识库不存在", 404, 404);
      return ok(kb);
    },
  );

  router.delete(
    "/api/ai/knowledge-bases/:id",
    perm("ai:knowledge-base", "delete"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "";
        await kbService.delete(id, tenantId);
        return ok(null);
      } catch (e) {
        return handleError(e);
      }
    },
  );

  // 文件操作
  router.get(
    "/api/ai/knowledge-bases/:id/files",
    perm("ai:knowledge-base", "list"),
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const q = ctx.query as Record<string, unknown>;
      const path = (q.path as string) || ".";
      const depth = Number(q.depth) || 2;
      const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "";
      const files = await kbService.ls(id, path, depth, tenantId);
      return ok(files);
    },
  );

  router.get(
    "/api/ai/knowledge-bases/:id/files/*",
    perm("ai:knowledge-base", "list"),
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const path =
        (ctx.params as Record<string, string>)["*"] ||
        (ctx.params as Record<string, string>).path ||
        "";
      const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "";
      const content = await kbService.cat(id, path, tenantId);
      if (!content) return fail("文件不存在", 404, 404);
      return ok(content);
    },
  );

  // 搜索
  router.get(
    "/api/ai/knowledge-bases/:id/search",
    perm("ai:knowledge-base", "list"),
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const q = ctx.query as Record<string, unknown>;
      const query = (q.q as string) || "";
      const limit = Number(q.limit) || 10;
      const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "";
      const results = await kbService.grep(id, query, undefined, tenantId, limit);
      return ok(results);
    },
  );

  return router;
}

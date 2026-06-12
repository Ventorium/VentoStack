/**
 * Skill 管理路由
 * 包含商店搜索/详情 + 已安装 CRUD + 安装/同步/升级
 */
import { createRouter } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import { ok, okPage, fail, handleError, parseBody, pageOf } from "./common";
import type { SkillStoreService } from "../services/skill-store";
import type { createSkillService } from "../services/skill";

type SkillSvc = ReturnType<typeof createSkillService>;

export function createSkillRoutes(
  skillService: SkillSvc,
  storeService: SkillStoreService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  // ── 商店搜索 ──
  router.get(
    "/api/ai/skills/store/search",
    perm("ai:skill", "list"),
    async (ctx) => {
      try {
        const q = ctx.query as Record<string, unknown>;
        const keyword = (q.keyword as string) ?? "";
        const page = Number(q.page) || 1;
        const pageSize = Math.min(50, Number(q.pageSize) || 24);
        const result = await storeService.search(keyword, page, pageSize);
        return ok(result);
      } catch (e) { return handleError(e); }
    },
  );

  // ── 商店详情 ──
  router.get(
    "/api/ai/skills/store/:slug",
    perm("ai:skill", "list"),
    async (ctx) => {
      try {
        const slug = (ctx.params as Record<string, string>).slug!;
        const detail = await storeService.getDetail(slug);
        const evaluation = await storeService.getEvaluation(slug);
        const recommendations = await storeService.getRecommendations(slug, 3);
        return ok({ ...detail, evaluation, recommendations });
      } catch (e) { return handleError(e); }
    },
  );

  // ── 商店文件列表 ──
  router.get(
    "/api/ai/skills/store/:slug/files",
    perm("ai:skill", "list"),
    async (ctx) => {
      try {
        const slug = (ctx.params as Record<string, string>).slug!;
        const q = ctx.query as Record<string, unknown>;
        const version = (q.version as string) ?? "";
        if (!version) return fail("version 参数必填", 400, 400);
        const files = await storeService.getFiles(slug, version);
        return ok(files);
      } catch (e) { return handleError(e); }
    },
  );

  // ── 商店文件内容 ──
  router.get(
    "/api/ai/skills/store/:slug/file",
    perm("ai:skill", "list"),
    async (ctx) => {
      try {
        const slug = (ctx.params as Record<string, string>).slug!;
        const q = ctx.query as Record<string, unknown>;
        const path = (q.path as string) ?? "";
        const version = (q.version as string) ?? "";
        if (!path || !version) return fail("path 和 version 参数必填", 400, 400);
        const content = await storeService.getFileContent(slug, path, version);
        return ok({ path, content });
      } catch (e) { return handleError(e); }
    },
  );

  // ── 从商店安装 ──
  router.post(
    "/api/ai/skills/store/:slug/install",
    perm("ai:skill", "create"),
    async (ctx) => {
      try {
        const slug = (ctx.params as Record<string, string>).slug!;
        const body = await parseBody(ctx.request);
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const result = await skillService.installFromStore({
          slug,
          version: body.version as string | undefined,
          tenantId,
        });
        return ok(result);
      } catch (e) { return handleError(e); }
    },
  );

  // ── 已安装列表 ──
  router.get(
    "/api/ai/skills",
    perm("ai:skill", "list"),
    async (ctx) => {
      try {
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const q = ctx.query as Record<string, unknown>;
        const { page, pageSize } = pageOf(q);
        const source = q.source as string | undefined;
        const enabled = q.enabled !== undefined ? q.enabled === "true" || q.enabled === true : undefined;
        const result = await skillService.list(tenantId, { source, enabled, page, pageSize });
        return okPage(result.list, result.total, page, pageSize);
      } catch (e) { return handleError(e); }
    },
  );

  // ── 已安装详情 ──
  router.get(
    "/api/ai/skills/:id",
    perm("ai:skill", "query"),
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
      const skill = await skillService.getById(id, tenantId);
      if (!skill) return fail("Skill 不存在", 404, 404);
      return ok(skill);
    },
  );

  // ── 文件列表 ──
  router.get(
    "/api/ai/skills/:id/files",
    perm("ai:skill", "query"),
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
      const skill = await skillService.getById(id, tenantId);
      if (!skill) return fail("Skill 不存在", 404, 404);
      return ok(skill.fileTree ?? []);
    },
  );

  // ── 文件内容 ──
  router.get(
    "/api/ai/skills/:id/file",
    perm("ai:skill", "query"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const q = ctx.query as Record<string, unknown>;
        const path = q.path as string;
        if (!path) return fail("path 参数必填", 400, 400);
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const content = await skillService.getFileContent(id, path, tenantId);
        if (content === null) return fail("文件不存在", 404, 404);
        return ok({ path, content });
      } catch (e) { return handleError(e); }
    },
  );

  // ── 更新启用/禁用 ──
  router.put(
    "/api/ai/skills/:id",
    perm("ai:skill", "update"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const body = await parseBody(ctx.request);
        if (body.enabled !== undefined) {
          await skillService.setEnabled(id, tenantId, body.enabled as boolean);
        }
        return ok(null);
      } catch (e) { return handleError(e); }
    },
  );

  // ── 卸载 ──
  router.delete(
    "/api/ai/skills/:id",
    perm("ai:skill", "delete"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        await skillService.uninstall(id, tenantId);
        return ok(null);
      } catch (e) { return handleError(e); }
    },
  );

  // ── 同步（检查最新版本 + 更新元数据） ──
  router.post(
    "/api/ai/skills/:id/sync",
    perm("ai:skill", "update"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const result = await skillService.syncSkill(id, tenantId);
        return ok(result);
      } catch (e) { return handleError(e); }
    },
  );

  // ── 升级到最新版本 ──
  router.post(
    "/api/ai/skills/:id/upgrade",
    perm("ai:skill", "update"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const result = await skillService.upgrade(id, tenantId);
        return ok(result);
      } catch (e) { return handleError(e); }
    },
  );

  // ── 批量检查更新 ──
  router.post(
    "/api/ai/skills/check-updates",
    perm("ai:skill", "list"),
    async (ctx) => {
      try {
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const updates = await skillService.checkUpdates(tenantId);
        return ok({ updates, count: updates.length });
      } catch (e) { return handleError(e); }
    },
  );

  // ── 上传 zip 安装 ──
  router.post(
    "/api/ai/skills/upload",
    perm("ai:skill", "create"),
    async (ctx) => {
      try {
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const formData = await ctx.request.formData();
        const file = formData.get("file") as File | null;
        const slug = formData.get("slug") as string;
        const name = formData.get("name") as string;
        const description = formData.get("description") as string | null;

        if (!file) return fail("请上传 zip 文件", 400, 400);
        if (!slug) return fail("slug 必填", 400, 400);
        if (!name) return fail("name 必填", 400, 400);

        const zipBuffer = Buffer.from(await file.arrayBuffer());
        const result = await skillService.installFromUpload({
          slug, name, description: description ?? undefined, zipBuffer, tenantId,
        });
        return ok(result);
      } catch (e) { return handleError(e); }
    },
  );

  return router;
}

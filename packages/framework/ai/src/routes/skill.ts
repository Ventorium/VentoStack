/**
 * Skill 管理路由
 * 包含商店搜索/详情 + 已安装 CRUD + 安装/同步/升级
 */
import { createRouter, success, paginated, fail, handleError, parseBody, pageOf } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import type { SkillStoreService } from "../services/skill-store";
import type { createSkillService } from "../services/skill";
import { join, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

type SkillSvc = ReturnType<typeof createSkillService>;

export function createSkillRoutes(
  skillService: SkillSvc,
  storeService: SkillStoreService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
  deps?: { storagePath?: string; workspacePath?: string },
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
        return success(result);
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
        return success({ ...detail, evaluation, recommendations });
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
        return success(files);
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
        return success({ path, content });
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
        return success(result);
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
        return paginated(result.list, result.total, page, pageSize);
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
      return success(skill);
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
      // 上传的技能从磁盘重新扫描，确保路径正确
      if (skill.source === "upload") {
        const files = await skillService.rescanFileTree(id, tenantId);
        return success(files);
      }
      const tree = typeof skill.fileTree === "string" ? JSON.parse(skill.fileTree) : (skill.fileTree ?? []);
      return success(tree);
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
        return success({ path, content });
      } catch (e) { return handleError(e); }
    },
  );

  // ── 写入文件内容（仅上传安装的技能） ──
  router.put(
    "/api/ai/skills/:id/file",
    perm("ai:skill", "update"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const q = ctx.query as Record<string, unknown>;
        const path = q.path as string;
        if (!path) return fail("path 参数必填", 400, 400);
        const body = await parseBody(ctx.request);
        if (typeof body.content !== "string") return fail("content 字段必填", 400, 400);
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        await skillService.writeFileContent(id, path, body.content as string, tenantId);
        return success(null);
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
        return success(null);
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
        return success(null);
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
        return success(result);
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
        return success(result);
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
        return success({ updates, count: updates.length });
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
        const version = (formData.get("version") as string | null) ?? "1.0.0";

        if (!file) return fail("请上传 zip 文件", 400, 400);
        if (!slug) return fail("slug 必填", 400, 400);
        if (!name) return fail("name 必填", 400, 400);

        const zipBuffer = Buffer.from(await file.arrayBuffer());
        const result = await skillService.installFromUpload({
          slug, name, description: description ?? undefined, version, zipBuffer, tenantId,
        });
        return success(result);
      } catch (e) { return handleError(e); }
    },
  );

  // ── 从工作区安装 Skill ──
  const WORKSPACE_BASE = deps?.workspacePath ?? "./data/skills/.workspace";

  router.post(
    "/api/ai/skills/install-from-workspace",
    perm("ai:skill", "create"),
    async (ctx) => {
      try {
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const body = await parseBody(ctx.request);
        const agentId = body.agentId as string;
        const slug = body.slug as string;
        const name = body.name as string;
        const description = body.description as string | undefined;
        const version = (body.version as string) ?? "1.0.0";

        if (!agentId) return fail("agentId 必填", 400, 400);
        if (!slug) return fail("slug 必填", 400, 400);
        if (!name) return fail("name 必填", 400, 400);

        // 验证工作区存在且有 SKILL.md
        const workspaceDir = resolve(join(WORKSPACE_BASE, agentId));
        const skillMdPath = join(workspaceDir, "SKILL.md");
        if (!existsSync(skillMdPath)) return fail("工作区中缺少 SKILL.md 文件", 400, 400);

        // 读取工作区中的所有文件
        const files = body.files as Array<{ path: string; content: string }> | undefined;
        if (!files?.length) return fail("没有文件可安装", 400, 400);

        const skillMdContent = files.find(f => f.path === "SKILL.md")?.content ?? "";
        const readmeContent = files.find(f => f.path === "README.md")?.content ?? null;

        const fileBuffers = files.map(f => ({
          path: f.path,
          content: Buffer.from(f.content, "utf-8"),
        }));

        const fileTree = files.map(f => ({
          path: f.path,
          size: Buffer.byteLength(f.content, "utf-8"),
        }));

        const result = await skillService.installFromUpload({
          slug, name, description, version,
          zipBuffer: Buffer.alloc(0),
          tenantId,
          filesOverride: fileBuffers,
          skillMdContentOverride: skillMdContent,
          readmeContentOverride: readmeContent,
          fileTreeOverride: fileTree,
        });

        return success(result);
      } catch (e) { return handleError(e); }
    },
  );

return router;
}

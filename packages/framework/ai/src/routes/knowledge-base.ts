/**
 * 知识库路由
 */
import { resolve } from "node:path";
import { readFile, existsSync } from "node:fs/promises";
import { createRouter, success, paginated, fail, handleError, parseBody, pageOf } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import type { KnowledgeBaseService } from "../knowledge-base/types";
import { createFileValidator } from "../knowledge-base/file-security";
import { routeDoc } from "./schema";

export function createKnowledgeBaseRoutes(
  kbService: KnowledgeBaseService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
  providerService?: { getConfig(key: string): Promise<string | null> },
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  // ── 知识库 CRUD ──

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
        return success(result);
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
      const name = (ctx.query as Record<string, unknown>).name as string | undefined;
      const result = await kbService.list({ tenantId, page, pageSize, name });
      return paginated(result.list, result.total, page, pageSize);
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
      return success(kb);
    },
  );

  router.put(
    "/api/ai/knowledge-bases/:id",
    perm("ai:knowledge-base", "update"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const body = await parseBody(ctx.request);
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? '';
        await kbService.updateMeta(
          id,
          {
            name: body.name as string | undefined,
            description: body.description as string | undefined,
          },
          tenantId,
        );
        return success(null);
      } catch (e) {
        return handleError(e);
      }
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
        return success(null);
      } catch (e) {
        return handleError(e);
      }
    },
  );

  // ── 文件浏览 ──

  router.get(
    "/api/ai/knowledge-bases/:id/files",
    routeDoc("浏览知识库文件", {
      query: {
        path: { type: "string", description: "目录路径（默认 .）" },
        depth: { type: "int", description: "递归深度（默认 2）" },
      },
    }),
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const q = ctx.query as Record<string, unknown>;
      const path = (q.path as string) || ".";
      const depth = Number(q.depth) || 2;
      const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "";
      const files = await kbService.ls(id, path, depth, tenantId);
      return success(files);
    },
    perm("ai:knowledge-base", "list"),
  );

  // 获取文件内容（cat 解析后 / raw 原始内容）
  router.get(
    "/api/ai/knowledge-bases/:id/files/*",
    perm("ai:knowledge-base", "list"),
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const q = ctx.query as Record<string, unknown>;
      const raw = (q.raw as string) === "true";
      const filePath =
        (ctx.params as Record<string, string>)["*"] ||
        (ctx.params as Record<string, string>).path ||
        "";
      const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "";

      if (raw) {
        // 返回原始内容（用于编辑器）
        const content = await kbService.cat(id, filePath, tenantId);
        if (!content) return fail("文件不存在", 404, 404);
        return success({ ...content, raw: content.content });
      }

      const content = await kbService.cat(id, filePath, tenantId);
      if (!content) return fail("文件不存在", 404, 404);
      return success(content);
    },
  );

  // ── 文件写入 ──

  router.put(
    "/api/ai/knowledge-bases/:id/files/*",
    routeDoc("写入知识库文件", {
      body: {
        content: { type: "string", required: true, description: "文件内容" },
      },
    }),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const filePath =
          (ctx.params as Record<string, string>)["*"] ||
          (ctx.params as Record<string, string>).path ||
          "";
        const body = await parseBody(ctx.request);
        const content = body.content as string;
        if (typeof content !== "string") {
          return fail("content 字段必填", 400, 400);
        }
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "";
        await kbService.writeFile(id, filePath, content, tenantId);
        return success(null);
      } catch (e) {
        return handleError(e);
      }
    },
    perm("ai:knowledge-base", "update"),
  );

  // ── 文件重命名 ──

  router.post(
    "/api/ai/knowledge-bases/:id/rename",
    routeDoc("重命名知识库文件", {
      body: {
        path: { type: "string", required: true, description: "原文件相对路径" },
        name: { type: "string", required: true, description: "新文件名" },
      },
    }),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const body = await parseBody(ctx.request);
        const filePath = body.path as string;
        const newName = body.name as string;
        if (!filePath || !newName) return fail("path 和 name 字段必填", 400, 400);
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "";
        await kbService.renameFile(id, filePath, newName, tenantId);
        return success(null);
      } catch (e) {
        return handleError(e);
      }
    },
    perm("ai:knowledge-base", "update"),
  );

  // ── 创建目录 ──

  router.post(
    "/api/ai/knowledge-bases/:id/mkdir",
    routeDoc("创建知识库目录", {
      body: {
        path: { type: "string", required: true, description: "目录路径（相对知识库根目录）" },
      },
    }),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const body = await parseBody(ctx.request);
        const path = body.path as string;
        if (!path) return fail("path 字段必填", 400, 400);
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "";
        await kbService.mkdir(id, path, tenantId);
        return success(null);
      } catch (e) {
        return handleError(e);
      }
    },
    perm("ai:knowledge-base", "update"),
  );

  // ── 文件启用/禁用 ──

  router.post(
    "/api/ai/knowledge-bases/:id/files/enabled",
    routeDoc("启用/禁用知识库文件", {
      body: {
        path: { type: "string", required: true, description: "文件相对路径" },
        enabled: { type: "boolean", required: true, description: "true 启用 / false 禁用" },
      },
    }),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const body = await parseBody(ctx.request);
        const filePath = body.path as string;
        const enabled = body.enabled;
        if (!filePath || typeof enabled !== "boolean") {
          return fail("path 和 enabled 字段必填", 400, 400);
        }
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "";
        await kbService.setFileEnabled(id, filePath, enabled, tenantId);
        return success(null);
      } catch (e) {
        return handleError(e);
      }
    },
    perm("ai:knowledge-base", "update"),
  );

  // ── 删除文件 ──

  router.delete(
    "/api/ai/knowledge-bases/:id/files/*",
    perm("ai:knowledge-base", "delete"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const filePath =
          (ctx.params as Record<string, string>)["*"] ||
          (ctx.params as Record<string, string>).path ||
          "";
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "";
        await kbService.deleteFile(id, filePath, tenantId);
        return success(null);
      } catch (e) {
        return handleError(e);
      }
    },
  );

  // ── 文件上传（支持 PDF/Word/文本）──
  router.post(
    "/api/ai/knowledge-bases/:id/upload",
    perm("ai:knowledge-base", "update"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "";

        // 解析 multipart form data
        const formData = await ctx.request.formData();
        const file = formData.get("file") as File | null;
        const targetDir = (formData.get("dir") as string) || undefined;

        if (!file) return fail("请上传文件", 400, 400);

        // 文件校验：大小上限 + 扩展名白名单
        const validator = createFileValidator();
        const check = validator.validateFile({ name: file.name, size: file.size });
        if (!check.valid) return fail(check.error ?? "文件校验失败", 400, 400);

        // 读取 OCR 配置
        const [ocrEnabledCfg, ocrLanguageCfg, ocrServerUrlCfg, ocrTokenCfg] = await Promise.all([
          providerService?.getConfig("ocr_enabled"),
          providerService?.getConfig("ocr_language"),
          providerService?.getConfig("ocr_server_url"),
          providerService?.getConfig("ocr_token"),
        ]);

        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await kbService.uploadFile(
          id,
          file.name,
          buffer,
          targetDir,
          tenantId,
          {
            ocrEnabled: ocrEnabledCfg !== "false",
            ocrLanguage: ocrLanguageCfg ?? undefined,
            ocrServerUrl: ocrServerUrlCfg ?? undefined,
            ocrToken: ocrTokenCfg ?? undefined,
          },
        );

        return success(result);
      } catch (e) {
        return handleError(e);
      }
    },
  );

  // ── 获取源文件（用于预览/下载）──
  router.get(
    "/api/ai/knowledge-bases/:id/source/*",
    perm("ai:knowledge-base", "list"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const filePath =
          (ctx.params as Record<string, string>)["*"] ||
          (ctx.params as Record<string, string>).path ||
          "";
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "";

        const result = await kbService.getSourceFile(id, filePath, tenantId);
        if (!result) return fail("源文件不存在", 404, 404);

        return new Response(result.buffer, {
          status: 200,
          headers: {
            "Content-Type": result.mimeType,
            "Content-Disposition": `inline; filename="${encodeURIComponent(result.fileName)}"`,
          },
        });
      } catch (e) {
        return handleError(e);
      }
    },
  );

  // ── 搜索 ──

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
      return success(results);
    },
  );

  return router;
}

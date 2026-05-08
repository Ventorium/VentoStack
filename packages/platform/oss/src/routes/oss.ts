/**
 * @ventostack/oss - 文件存储路由
 */

import { createRouter } from "@ventostack/core";
import type { Middleware, Router, RouteSchemaConfig } from "@ventostack/core";
import type { OSSService } from "../services/oss";
import { ok, okPage, fail, pageOf } from "./common";

/** 上传文件大小限制 (50MB) */
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;

const fileItemSchema = {
  id: { type: "uuid" as const, description: "文件 ID" },
  filename: { type: "string" as const, description: "文件名" },
  contentType: { type: "string" as const, description: "MIME 类型" },
  size: { type: "int" as const, description: "文件大小（字节）" },
  bucket: { type: "string" as const, description: "存储桶" },
  uploaderId: { type: "uuid" as const, description: "上传者 ID" },
  createdAt: { type: "date" as const, description: "创建时间" },
};

const paginatedFileSchema = {
  list: { type: "array" as const, description: "文件列表" },
  total: { type: "int" as const, description: "总数" },
  page: { type: "int" as const, description: "当前页" },
  pageSize: { type: "int" as const, description: "每页数量" },
  totalPages: { type: "int" as const, description: "总页数" },
};

export function createOSSRoutes(
  ossService: OSSService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  // Upload file
  router.post("/api/oss/upload", {
    formData: {
      file: { type: "file" as const, required: true, description: "上传文件" },
      bucket: { type: "string" as const, default: "default", description: "存储桶" },
    },
    responses: { 200: fileItemSchema },
    openapi: { summary: "上传文件", tags: ["oss"], operationId: "uploadFile" },
  }, async (ctx) => {
    try {
      const contentType = ctx.request.headers.get("Content-Type") ?? "";

      if (!contentType.includes("multipart/form-data")) {
        return fail("Content-Type 必须为 multipart/form-data", 400);
      }

      const formData = await ctx.request.formData();
      const file = formData.get("file");
      if (!file || !(file instanceof File)) {
        return fail("缺少文件字段", 400);
      }

      if (file.size > MAX_UPLOAD_SIZE) {
        return fail(`文件过大，最大 ${MAX_UPLOAD_SIZE / 1024 / 1024}MB`, 400);
      }

      const bucket = (formData.get("bucket") as string) ?? "default";
      const user = ctx.user as { id: string };
      const arrayBuffer = await file.arrayBuffer();
      const data = Buffer.from(arrayBuffer);

      const result = await ossService.upload({
        filename: file.name,
        data,
        contentType: file.type || undefined,
        bucket,
      }, user.id);

      return ok(result);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "上传失败", 400);
    }
  }, perm("oss", "file:upload"));

  // List files
  router.get("/api/oss", {
    query: {
      page: { type: "int" as const, default: 1, description: "页码" },
      pageSize: { type: "int" as const, default: 10, description: "每页数量" },
      bucket: { type: "string" as const, description: "存储桶筛选" },
      uploaderId: { type: "uuid" as const, description: "上传者 ID 筛选" },
    },
    responses: { 200: paginatedFileSchema },
    openapi: { summary: "获取文件列表", tags: ["oss"], operationId: "listFiles" },
  }, async (ctx) => {
    const q = ctx.query as Record<string, unknown>;
    const { page, pageSize } = pageOf(q);
    const result = await ossService.list({
      bucket: q.bucket as string | undefined,
      uploaderId: q.uploaderId as string | undefined,
      page,
      pageSize,
    });
    return okPage(result.items, result.total, result.page, result.pageSize);
  }, perm("oss", "file:list"));

  // Get file metadata
  router.get("/api/oss/:id", {
    responses: { 200: fileItemSchema },
    openapi: { summary: "获取文件详情", tags: ["oss"], operationId: "getFile" },
  }, async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const file = await ossService.getById(id);
    if (!file) return fail("文件不存在", 404, 404);
    return ok(file);
  }, perm("oss", "file:query"));

  // Download file
  router.get("/api/oss/:id/download", {
    openapi: { summary: "下载文件", tags: ["oss"], operationId: "downloadFile" },
  }, async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const result = await ossService.download(id);
    if (!result) return fail("文件不存在", 404, 404);

    return new Response(result.stream, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(result.filename)}"`,
      },
    });
  }, perm("oss", "file:download"));

  // Get signed URL
  router.get("/api/oss/:id/url", {
    query: {
      expiresIn: { type: "int" as const, default: 3600, description: "过期时间（秒）" },
    },
    responses: {
      200: {
        url: { type: "string" as const, description: "签名 URL" },
        expiresIn: { type: "int" as const, description: "过期时间（秒）" },
      },
    },
    openapi: { summary: "获取签名 URL", tags: ["oss"], operationId: "getSignedUrl" },
  }, async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const q = ctx.query as Record<string, unknown>;
    const expiresIn = q.expiresIn ? Number(q.expiresIn) : 3600;
    const url = await ossService.getSignedUrl(id, expiresIn);
    if (!url) return fail("文件不存在", 404, 404);
    return ok({ url, expiresIn });
  }, perm("oss", "file:query"));

  // Delete file
  router.delete("/api/oss/:id", {
    openapi: { summary: "删除文件", tags: ["oss"], operationId: "deleteFile" },
  }, async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    await ossService.delete(id);
    return ok(null);
  }, perm("oss", "file:delete"));

  return router;
}

/**
 * @ventostack/oss - OSS 服务
 * 文件上传、下载、删除、签名 URL、列表查询
 */

import type { Database } from "@ventostack/database";
import type { StorageAdapter } from "../adapters/storage";
import { OSSFileModel } from "../models";
import { assertSafeUpload } from "./mime-detect";

/** 上传参数 */
export interface UploadParams {
  filename: string;
  data: Buffer;
  contentType?: string;
  bucket?: string;
}

/** 文件记录 */
export interface OSSFileRecord {
  id: string;
  originalName: string;
  storagePath: string;
  size: number;
  mimeType: string | null;
  extension: string | null;
  bucket: string;
  tenantId: string;
  uploaderId: string | null;
  createdAt: string;
}

/** 分页结果 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 文件列表查询参数 */
export interface ListParams {
  /** 租户 ID（必填，强制租户隔离） */
  tenantId: string;
  bucket?: string;
  uploaderId?: string;
  /** 文件名模糊搜索 */
  filename?: string;
  page?: number;
  pageSize?: number;
}

/** OSS 服务接口 */
export interface OSSService {
  upload(params: UploadParams, uploaderId: string, tenantId: string): Promise<OSSFileRecord>;
  download(
    fileId: string,
    tenantId: string,
  ): Promise<{ stream: ReadableStream; contentType: string; filename: string } | null>;
  delete(fileId: string, tenantId: string): Promise<void>;
  getSignedUrl(fileId: string, tenantId: string, expiresIn?: number): Promise<string | null>;
  getById(fileId: string, tenantId: string): Promise<OSSFileRecord | null>;
  list(params: ListParams): Promise<PaginatedResult<OSSFileRecord>>;
}

export function createOSSService(deps: {
  db: Database;
  storage: StorageAdapter;
}): OSSService {
  const { db, storage } = deps;

  return {
    async upload(params, uploaderId, tenantId): Promise<OSSFileRecord> {
      const { filename, data, contentType, bucket = "default" } = params;
      const id = crypto.randomUUID();

      // 安全校验：扩展名白名单 + magic bytes 校验，返回权威 MIME（拒绝伪造 contentType）
      // 允许上传的文件类型由 UPLOAD_ALLOWED_EXTENSIONS 白名单决定，
      // 显式排除 html/svg/xml/js 等可执行/可嵌入脚本类型，防止同源存储型 XSS。
      const mime = assertSafeUpload(filename, data);
      void contentType;

      // Generate storage path: bucket/tenant/yyyymmdd/id.ext（租户段隔离物理存储）
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const ext = filename.includes(".") ? `.${filename.split(".").pop()!.toLowerCase()}` : null;
      const storagePath = `${bucket}/${tenantId}/${date}/${id}${ext ?? ""}`;

      // Write to storage adapter
      await storage.write(storagePath, data, mime ?? undefined);

      // Insert metadata record
      await db.query(OSSFileModel).insert({
        id,
        original_name: filename,
        storage_path: storagePath,
        size: BigInt(data.length),
        mime_type: mime,
        extension: ext,
        bucket,
        tenant_id: tenantId,
        uploader_id: uploaderId,
      });

      return {
        id,
        originalName: filename,
        storagePath,
        size: data.length,
        mimeType: mime,
        extension: ext,
        bucket,
        tenantId,
        uploaderId,
        createdAt: new Date().toISOString(),
      };
    },

    // 按文件 ID + 租户过滤，防止跨租户越权访问
    async download(fileId, tenantId) {
      const file = await db
        .query(OSSFileModel)
        .where("id", "=", fileId)
        .where("tenant_id", "=", tenantId)
        .select("id", "original_name", "storage_path", "mime_type")
        .get();
      if (!file) return null;

      const stream = await storage.read(file.storage_path);
      if (!stream) return null;

      return {
        stream,
        contentType: file.mime_type ?? "application/octet-stream",
        filename: file.original_name,
      };
    },

    async delete(fileId, tenantId) {
      const file = await db
        .query(OSSFileModel)
        .where("id", "=", fileId)
        .where("tenant_id", "=", tenantId)
        .select("storage_path")
        .get();
      if (!file) return;

      await storage.delete(file.storage_path);
      await db
        .query(OSSFileModel)
        .where("id", "=", fileId)
        .where("tenant_id", "=", tenantId)
        .hardDelete();
    },

    async getSignedUrl(fileId, tenantId, expiresIn = 3600) {
      const file = await db
        .query(OSSFileModel)
        .where("id", "=", fileId)
        .where("tenant_id", "=", tenantId)
        .select("storage_path")
        .get();
      if (!file) return null;

      return storage.getSignedUrl(file.storage_path, expiresIn);
    },

    async getById(fileId, tenantId) {
      const row = await db
        .query(OSSFileModel)
        .where("id", "=", fileId)
        .where("tenant_id", "=", tenantId)
        .select(
          "id",
          "original_name",
          "storage_path",
          "size",
          "mime_type",
          "extension",
          "bucket",
          "tenant_id",
          "uploader_id",
          "created_at",
        )
        .get();
      if (!row) return null;

      return {
        id: row.id,
        originalName: row.original_name,
        storagePath: row.storage_path,
        size: Number(row.size),
        mimeType: row.mime_type ?? null,
        extension: row.extension ?? null,
        bucket: row.bucket,
        tenantId: row.tenant_id ?? "default",
        uploaderId: row.uploader_id ?? null,
        createdAt:
          row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      };
    },

    async list(params): Promise<PaginatedResult<OSSFileRecord>> {
      const { tenantId, bucket, uploaderId, filename, page = 1, pageSize = 10 } = params;
      // 租户过滤为强制条件，bucket/uploaderId/filename 仅作为租户内的附加筛选

      let query = db.query(OSSFileModel).where("tenant_id", "=", tenantId);
      if (bucket) query = query.where("bucket", "=", bucket);
      if (uploaderId) query = query.where("uploader_id", "=", uploaderId);
      if (filename) query = query.where("original_name", "LIKE", `%${filename}%`);

      const total = await query.count();

      const rows = await query
        .select(
          "id",
          "original_name",
          "storage_path",
          "size",
          "mime_type",
          "extension",
          "bucket",
          "tenant_id",
          "uploader_id",
          "created_at",
        )
        .orderBy("created_at", "desc")
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .list();

      const items: OSSFileRecord[] = rows.map((row) => ({
        id: row.id,
        originalName: row.original_name,
        storagePath: row.storage_path,
        size: Number(row.size),
        mimeType: row.mime_type ?? null,
        extension: row.extension ?? null,
        bucket: row.bucket,
        tenantId: row.tenant_id ?? "default",
        uploaderId: row.uploader_id ?? null,
        createdAt:
          row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      }));

      return {
        items,
        total,
        page,
        pageSize,
        totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
      };
    },
  };
}

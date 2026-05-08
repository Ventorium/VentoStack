/**
 * @ventostack/oss - OSS 服务
 * 文件上传、下载、删除、签名 URL、列表查询
 */

import type { Database } from "@ventostack/database";
import type { StorageAdapter } from "../adapters/storage";
import { detectMIME, mimeFromExtension } from "./mime-detect";
import { OSSFileModel } from "../models";

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
  bucket?: string;
  uploaderId?: string;
  page?: number;
  pageSize?: number;
}

/** OSS 服务接口 */
export interface OSSService {
  upload(params: UploadParams, uploaderId: string): Promise<OSSFileRecord>;
  download(fileId: string): Promise<{ stream: ReadableStream; contentType: string; filename: string } | null>;
  delete(fileId: string): Promise<void>;
  getSignedUrl(fileId: string, expiresIn?: number): Promise<string | null>;
  getById(fileId: string): Promise<OSSFileRecord | null>;
  list(params: ListParams): Promise<PaginatedResult<OSSFileRecord>>;
}

export function createOSSService(deps: {
  db: Database;
  storage: StorageAdapter;
}): OSSService {
  const { db, storage } = deps;

  return {
    async upload(params, uploaderId) {
      const { filename, data, contentType, bucket = "default" } = params;
      const id = crypto.randomUUID();

      // Detect MIME
      const ext = filename.includes(".") ? `.${filename.split(".").pop()!.toLowerCase()}` : null;
      const detectedMime = data.length >= 12 ? detectMIME(data) : null;
      const mime = contentType ?? detectedMime ?? (ext ? mimeFromExtension(ext) : null);

      // Generate storage path: bucket/yyyymmdd/id.ext
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const storagePath = `${bucket}/${date}/${id}${ext ?? ""}`;

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
        uploaderId,
        createdAt: new Date().toISOString(),
      };
    },

    async download(fileId) {
      const file = await db.query(OSSFileModel)
        .where("id", "=", fileId)
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

    async delete(fileId) {
      const file = await db.query(OSSFileModel)
        .where("id", "=", fileId)
        .select("storage_path")
        .get();
      if (!file) return;

      await storage.delete(file.storage_path);
      await db.query(OSSFileModel).where("id", "=", fileId).hardDelete();
    },

    async getSignedUrl(fileId, expiresIn = 3600) {
      const file = await db.query(OSSFileModel)
        .where("id", "=", fileId)
        .select("storage_path")
        .get();
      if (!file) return null;

      return storage.getSignedUrl(file.storage_path, expiresIn);
    },

    async getById(fileId) {
      const row = await db.query(OSSFileModel)
        .where("id", "=", fileId)
        .select("id", "original_name", "storage_path", "size", "mime_type", "extension", "bucket", "uploader_id", "created_at")
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
        uploaderId: row.uploader_id ?? null,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      };
    },

    async list(params) {
      const { bucket, uploaderId, page = 1, pageSize = 10 } = params;

      let query = db.query(OSSFileModel);
      if (bucket) query = query.where("bucket", "=", bucket);
      if (uploaderId) query = query.where("uploader_id", "=", uploaderId);

      const total = await query.count();

      const rows = await query
        .select("id", "original_name", "storage_path", "size", "mime_type", "extension", "bucket", "uploader_id", "created_at")
        .orderBy("created_at", "desc")
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .list();

      const items = rows.map((row) => ({
        id: row.id,
        originalName: row.original_name,
        storagePath: row.storage_path,
        size: Number(row.size),
        mimeType: row.mime_type ?? null,
        extension: row.extension ?? null,
        bucket: row.bucket,
        uploaderId: row.uploader_id ?? null,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      }));

      return { items, total, page, pageSize, totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0 };
    },
  };
}

/**
 * S3 兼容存储适配器
 *
 * 使用 Bun 原生 S3Client，支持 AWS S3、MinIO、Cloudflare R2 等 S3 兼容服务。
 */

import { S3Client } from "bun";
import type { StorageAdapter } from "./storage";

export interface S3StorageOptions {
  bucket: string;
  region?: string | undefined;
  endpoint?: string | undefined;
  accessKeyId: string;
  secretAccessKey: string;
  /** 公开访问 base URL，若设置则 getSignedUrl 返回此 URL 而非签名 */
  publicBaseUrl?: string | undefined;
}

export function createS3Storage(options: S3StorageOptions): StorageAdapter {
  const { bucket, publicBaseUrl } = options;

  const client = new S3Client({
    bucket,
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
    ...(options.region ? { region: options.region } : {}),
    ...(options.endpoint ? { endpoint: options.endpoint } : {}),
  });

  return {
    async write(key, data, contentType) {
      // S3File.write 接受 string | ArrayBufferView | ArrayBuffer | Blob | Response 等
      // StorageAdapter 的 data 类型是 Buffer | ReadableStream
      // Buffer 是 ArrayBufferView 的子类，可直接传入
      // ReadableStream 需要包装为 Response
      const opts = contentType ? { type: contentType } : undefined;
      if (data instanceof Buffer) {
        await client.file(key).write(data, opts);
      } else {
        await client.file(key).write(new Response(data), opts);
      }
    },

    async read(key) {
      try {
        // S3File 继承自 Blob，使用 stream() 获取 ReadableStream
        const file = client.file(key);
        await file.stat(); // 确认文件存在
        return file.stream();
      } catch {
        return null;
      }
    },

    async delete(key) {
      try {
        await client.file(key).unlink();
      } catch {
        // 文件可能不存在，忽略
      }
    },

    async exists(key) {
      try {
        await client.file(key).stat();
        return true;
      } catch {
        return false;
      }
    },

    async getSignedUrl(key, expiresIn = 3600) {
      if (publicBaseUrl) {
        return `${publicBaseUrl}/${key}`;
      }
      return client.file(key).presign({ expiresIn });
    },
  };
}

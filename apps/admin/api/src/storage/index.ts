/**
 * 存储适配器工厂
 *
 * 根据 STORAGE_DRIVER 环境变量创建对应的存储适配器：
 * - local: 本地文件系统
 * - s3: S3 兼容存储（AWS S3、MinIO、Cloudflare R2 等）
 */

import { createLocalStorage, createS3Storage } from "@ventostack/oss";
import type { StorageAdapter } from "@ventostack/oss";
import { resolve } from "node:path";
import { env } from "../config";

export function createStorageAdapter(): StorageAdapter {
  if (env.STORAGE_DRIVER === "s3") {
    return createS3Storage({
      bucket: env.S3_BUCKET!,
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      ...(env.S3_REGION ? { region: env.S3_REGION } : {}),
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
      ...(env.S3_PUBLIC_BASE_URL ? { publicBaseUrl: env.S3_PUBLIC_BASE_URL } : {}),
    });
  }

  return createLocalStorage({
    basePath: resolve(env.STORAGE_LOCAL_PATH),
    baseUrl: env.STORAGE_LOCAL_BASE_URL,
  });
}

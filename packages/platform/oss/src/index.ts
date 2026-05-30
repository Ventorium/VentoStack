/**
 * @ventostack/oss — 文件存储服务
 *
 * 提供文件上传、下载、删除、签名 URL、MIME 检测等能力。
 * 支持本地存储和 S3 兼容存储适配器。
 */

// Models
export { OSSFileModel } from "./models/oss-file";

// Adapters
export type { StorageAdapter } from "./adapters/storage";
export { createLocalStorage } from "./adapters/local-storage";
export type { LocalStorageOptions } from "./adapters/local-storage";
export { createS3Storage } from "./adapters/s3-storage";
export type { S3StorageOptions } from "./adapters/s3-storage";

// Services
export { createOSSService } from "./services/oss";
export type {
  UploadParams,
  OSSFileRecord,
  PaginatedResult,
  ListParams,
  OSSService,
} from "./services/oss";
export { detectMIME, mimeFromExtension } from "./services/mime-detect";

// Routes
export { createOSSRoutes } from "./routes/oss";

// Module
export { createOSSModule } from "./module";
export type { OSSModule, OSSModuleDeps } from "./module";

// Migrations
export { createOssTables } from "./migrations/001_create_oss_tables";

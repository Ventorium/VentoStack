/**
 * Knowledge Base 模块（本地文件目录模式）
 */
export type {
  KnowledgeBase,
  FileEntry,
  FileContent,
  SearchResult,
  FileMapping,
  KnowledgeBaseService,
} from "./types";
export { createKnowledgeBaseService } from "./service";
export type { KnowledgeBaseServiceDeps } from "./service";
export { parseMarkdown, extractWikiLinks } from "./markdown-parser";
export { createFileValidator } from "./file-security";
export type { FileValidator, FileSecurityConfig } from "./file-security";
export { createTenantQuery } from "./tenant-query";
export type { TenantQuery } from "./tenant-query";

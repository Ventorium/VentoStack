/**
 * 知识库类型定义（本地文件目录模式）
 */

export interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  basePath: string;
  tenantId: string;
  createdBy: string;
  status: "active" | "archived";
  fileCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  modifiedAt: Date;
  children?: FileEntry[];
}

export interface FileContent {
  path: string;
  title: string;
  content: string;
  frontmatter?: Record<string, string>;
  links?: string[];
  sourcePath?: string;
}

export interface SearchResult {
  path: string;
  title: string;
  excerpt: string;
  lineNumber: number;
  score: number;
}

export interface FileMapping {
  source: string | null;
  content: string;
  title: string;
  parsedAt: string | null;
  parser: string | null;
  sourceSize: number | null;
  contentSize: number;
}

export interface KnowledgeBaseService {
  // 知识库 CRUD
  create(params: {
    name: string;
    description?: string;
    tenantId: string;
    userId: string;
  }): Promise<{ id: string; basePath: string }>;
  getById(id: string, tenantId: string): Promise<KnowledgeBase | null>;
  list(params: {
    tenantId: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ list: KnowledgeBase[]; total: number }>;
  delete(id: string, tenantId: string): Promise<void>;

  // 文件操作（供 LLM 工具调用）
  ls(
    kbId: string,
    path: string,
    depth: number,
    tenantId: string,
  ): Promise<FileEntry[]>;
  cat(kbId: string, path: string, tenantId: string): Promise<FileContent | null>;
  grep(
    kbId: string,
    query: string,
    path: string | undefined,
    tenantId: string,
    limit: number,
  ): Promise<SearchResult[]>;
  find(
    kbId: string,
    name: string | undefined,
    ext: string | undefined,
    path: string | undefined,
    tenantId: string,
  ): Promise<FileEntry[]>;
  head(
    kbId: string,
    path: string,
    lines: number,
    tenantId: string,
  ): Promise<string>;
  tail(
    kbId: string,
    path: string,
    lines: number,
    tenantId: string,
  ): Promise<string>;

  // 追踪链
  getSourcePath(
    kbId: string,
    contentPath: string,
    tenantId: string,
  ): Promise<string | null>;
}

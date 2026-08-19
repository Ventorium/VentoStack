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

/** Markdown 标题大纲条目（用于 Agent 自主导航检索） */
export interface MarkdownOutlineEntry {
  level: number;
  text: string;
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
  /** 更新知识库元数据（name/description）；新数据按 meta.tenantId 校验租户归属 */
  updateMeta(
    id: string,
    params: { name?: string; description?: string },
    tenantId?: string,
  ): Promise<void>;

  // 文件浏览（供 LLM 工具调用 + 前端）
  ls(
    kbId: string,
    path: string,
    depth: number,
    tenantId: string,
  ): Promise<FileEntry[]>;
  cat(kbId: string, path: string, tenantId: string): Promise<FileContent | null>;
  /** 提取 markdown 文件的标题大纲（# ~ ####），供 Agent 自主导航定位章节 */
  outline(
    kbId: string,
    path: string,
    tenantId: string,
  ): Promise<MarkdownOutlineEntry[]>;
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

  // 文件写入（前端管理）
  writeFile(
    kbId: string,
    path: string,
    content: string,
    tenantId: string,
  ): Promise<void>;
  renameFile(
    kbId: string,
    oldPath: string,
    newName: string,
    tenantId: string,
  ): Promise<void>;
  mkdir(
    kbId: string,
    path: string,
    tenantId: string,
  ): Promise<void>;
  deleteFile(
    kbId: string,
    path: string,
    tenantId: string,
  ): Promise<void>;

  // 文件上传（含解析）
  uploadFile(
    kbId: string,
    fileName: string,
    fileBuffer: Buffer,
    targetDir: string | undefined,
    tenantId: string,
    ocrOptions?: { ocrEnabled?: boolean; ocrLanguage?: string; ocrServerUrl?: string },
  ): Promise<{ contentPath: string; sourcePath: string | null }>;

  // 获取源文件内容（用于下载/预览）
  getSourceFile(
    kbId: string,
    path: string,
    tenantId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string } | null>;

  // README 自动生成
  generateReadme(kbId: string, tenantId: string): Promise<void>;

  // 追踪链
  getSourcePath(
    kbId: string,
    contentPath: string,
    tenantId: string,
  ): Promise<string | null>;
}

/**
 * 知识库服务（本地文件目录模式）
 * 知识库 = 文件目录，LLM 用工具浏览和读取
 */
import { resolve, join, relative, basename, extname } from "node:path";
import { readdir, readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { aiErrors } from "../errors";
import type {
  FileEntry,
  FileContent,
  SearchResult,
  KnowledgeBase,
  KnowledgeBaseService,
} from "./types";
import { parseMarkdown } from "./markdown-parser";

export interface KnowledgeBaseServiceDeps {
  storagePath: string; // /data/knowledge-bases
  db: unknown; // Database
}

export function createKnowledgeBaseService(
  deps: KnowledgeBaseServiceDeps,
): KnowledgeBaseService {
  const { storagePath } = deps;

  function getKBPath(kbId: string): string {
    return resolve(storagePath, kbId);
  }

  function getContentPath(kbId: string): string {
    return resolve(getKBPath(kbId), "content");
  }

  function getSourcesPath(kbId: string): string {
    return resolve(getKBPath(kbId), "sources");
  }

  /**
   * 安全路径校验：确保路径在 basePath 内
   */
  function safePath(basePath: string, targetPath: string): string {
    const resolved = resolve(basePath, targetPath);
    if (!resolved.startsWith(basePath)) {
      throw aiErrors.kbFileNotFound();
    }
    return resolved;
  }

  /**
   * 递归读取目录
   */
  async function readDirRecursive(
    dirPath: string,
    basePath: string,
    depth: number,
    currentDepth: number = 0,
  ): Promise<FileEntry[]> {
    if (currentDepth >= depth) return [];

    const entries: FileEntry[] = [];
    const items = await readdir(dirPath, { withFileTypes: true });

    for (const item of items) {
      const fullPath = join(dirPath, item.name);
      const relativePath = relative(basePath, fullPath);
      const stats = await stat(fullPath).catch(() => null);
      if (!stats) continue;

      if (item.isDirectory()) {
        const children =
          currentDepth + 1 < depth
            ? await readDirRecursive(fullPath, basePath, depth, currentDepth + 1)
            : [];
        entries.push({
          name: item.name,
          path: relativePath,
          type: "directory",
          size: 0,
          modifiedAt: stats.mtime,
          children,
        });
      } else if (item.name.endsWith(".md") || item.name.endsWith(".txt")) {
        entries.push({
          name: item.name,
          path: relativePath,
          type: "file",
          size: stats.size,
          modifiedAt: stats.mtime,
        });
      }
    }

    return entries;
  }

  return {
    async create(params) {
      const id = crypto.randomUUID();
      const kbPath = getKBPath(id);

      await mkdir(join(kbPath, "sources"), { recursive: true });
      await mkdir(join(kbPath, "content"), { recursive: true });

      // 生成 README.md 索引
      await writeFile(
        join(kbPath, "content", "README.md"),
        `# ${params.name}\n\n${params.description ?? ""}\n\n> 知识库为空，请上传文档。\n`,
        "utf-8",
      );

      return { id, basePath: kbPath };
    },

    async getById(id, tenantId) {
      const kbPath = getKBPath(id);
      if (!existsSync(kbPath)) return null;

      const contentDir = getContentPath(id);
      const files = existsSync(contentDir)
        ? await readdir(contentDir).catch(() => [])
        : [];

      return {
        id,
        name: basename(kbPath),
        basePath: kbPath,
        tenantId,
        createdBy: "",
        status: "active",
        fileCount: files.length,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },

    async list(params) {
      // 简化实现：扫描 storagePath 下的所有目录
      const items = existsSync(storagePath)
        ? await readdir(storagePath, { withFileTypes: true }).catch(() => [])
        : [];

      const list: KnowledgeBase[] = [];
      for (const item of items) {
        if (item.isDirectory()) {
          const kbPath = join(storagePath, item.name);
          const contentDir = join(kbPath, "content");
          const files = existsSync(contentDir)
            ? await readdir(contentDir).catch(() => [])
            : [];

          list.push({
            id: item.name,
            name: item.name,
            basePath: kbPath,
            tenantId: params.tenantId,
            createdBy: "",
            status: "active",
            fileCount: files.length,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }

      const page = params.page ?? 1;
      const pageSize = params.pageSize ?? 20;
      const start = (page - 1) * pageSize;
      const end = start + pageSize;

      return {
        list: list.slice(start, end),
        total: list.length,
      };
    },

    async delete(id, tenantId) {
      const kbPath = getKBPath(id);
      if (!existsSync(kbPath)) return;
      // 实际实现需要递归删除目录
      // await rm(kbPath, { recursive: true, force: true });
    },

    async ls(kbId, path, depth, tenantId) {
      const contentDir = getContentPath(kbId);
      const targetPath = safePath(contentDir, path || ".");
      if (!existsSync(targetPath)) return [];

      return readDirRecursive(targetPath, contentDir, depth);
    },

    async cat(kbId, path, tenantId) {
      const contentDir = getContentPath(kbId);
      const filePath = safePath(contentDir, path);

      if (!existsSync(filePath)) return null;

      const content = await readFile(filePath, "utf-8");
      const parsed = parseMarkdown(content);
      const title = parsed.frontmatter.title ?? basename(filePath, extname(filePath));

      return {
        path,
        title,
        content: parsed.body,
        frontmatter: parsed.frontmatter,
        links: parsed.links,
      };
    },

    async grep(kbId, query, path, tenantId, limit) {
      const contentDir = getContentPath(kbId);
      const searchPath = path ? safePath(contentDir, path) : contentDir;

      const results: SearchResult[] = [];
      const queryLower = query.toLowerCase();

      async function searchDir(dir: string) {
        if (results.length >= limit) return;
        const items = await readdir(dir, { withFileTypes: true }).catch(
          () => [],
        );

        for (const item of items) {
          if (results.length >= limit) break;
          const fullPath = join(dir, item.name);

          if (item.isDirectory()) {
            await searchDir(fullPath);
          } else if (
            item.name.endsWith(".md") ||
            item.name.endsWith(".txt")
          ) {
            const content = await readFile(fullPath, "utf-8").catch(() => "");
            const lines = content.split("\n");

            for (let i = 0; i < lines.length; i++) {
              if (results.length >= limit) break;
              if (lines[i].toLowerCase().includes(queryLower)) {
                const relativePath = relative(contentDir, fullPath);
                const excerpt = lines
                  .slice(Math.max(0, i - 1), i + 3)
                  .join("\n");
                results.push({
                  path: relativePath,
                  title: basename(fullPath, extname(fullPath)),
                  excerpt,
                  lineNumber: i + 1,
                  score: 1.0,
                });
              }
            }
          }
        }
      }

      await searchDir(searchPath);
      return results;
    },

    async find(kbId, name, ext, path, tenantId) {
      const contentDir = getContentPath(kbId);
      const searchPath = path ? safePath(contentDir, path) : contentDir;

      const results: FileEntry[] = [];

      async function searchDir(dir: string) {
        const items = await readdir(dir, { withFileTypes: true }).catch(
          () => [],
        );

        for (const item of items) {
          const fullPath = join(dir, item.name);
          const relativePath = relative(contentDir, fullPath);
          const stats = await stat(fullPath).catch(() => null);

          if (item.isDirectory()) {
            results.push({
              name: item.name,
              path: relativePath,
              type: "directory",
              size: 0,
              modifiedAt: stats?.mtime ?? new Date(),
            });
            await searchDir(fullPath);
          } else {
            const matchesName = !name || item.name.includes(name);
            const matchesExt = !ext || item.name.endsWith(ext);
            if (matchesName && matchesExt) {
              results.push({
                name: item.name,
                path: relativePath,
                type: "file",
                size: stats?.size ?? 0,
                modifiedAt: stats?.mtime ?? new Date(),
              });
            }
          }
        }
      }

      await searchDir(searchPath);
      return results;
    },

    async head(kbId, path, lines, tenantId) {
      const contentDir = getContentPath(kbId);
      const filePath = safePath(contentDir, path);
      if (!existsSync(filePath)) return "";

      const content = await readFile(filePath, "utf-8");
      return content.split("\n").slice(0, lines).join("\n");
    },

    async tail(kbId, path, lines, tenantId) {
      const contentDir = getContentPath(kbId);
      const filePath = safePath(contentDir, path);
      if (!existsSync(filePath)) return "";

      const content = await readFile(filePath, "utf-8");
      const allLines = content.split("\n");
      return allLines.slice(-lines).join("\n");
    },

    async getSourcePath(kbId, contentPath, tenantId) {
      // 读取 manifest.json 查找源文件路径
      const kbPath = getKBPath(kbId);
      const manifestPath = join(kbPath, "manifest.json");
      if (!existsSync(manifestPath)) return null;

      const manifest = JSON.parse(
        await readFile(manifestPath, "utf-8"),
      ) as { files: Array<{ source: string | null; content: string }> };

      const mapping = manifest.files.find((f) => f.content === contentPath);
      return mapping?.source ?? null;
    },
  };
}

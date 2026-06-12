/**
 * 知识库服务（本地文件目录模式）
 * 知识库 = 文件目录，LLM 用工具浏览和读取
 */
import { resolve, join, relative, basename, extname, dirname } from "node:path";
import {
  readdir,
  readFile,
  stat,
  mkdir,
  writeFile,
  rename,
  rm,
  unlink,
} from "node:fs/promises";
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
import { parseFile, needsParsing } from "./parsers";
import { lookup } from "mime-types";

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

    // 目录在前，文件在后；同类型按名称排序
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return entries;
  }

  /**
   * 递归生成 README.md 索引
   */
  async function buildReadmeTree(
    dirPath: string,
    basePath: string,
    indent: number = 0,
  ): Promise<string> {
    const lines: string[] = [];
    const items = await readdir(dirPath, { withFileTypes: true }).catch(() => []);
    const prefix = "  ".repeat(indent);

    // 目录在前
    const dirs = items.filter((i) => i.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
    const files = items
      .filter((i) => i.isFile() && (i.name.endsWith(".md") || i.name.endsWith(".txt")))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const dir of dirs) {
      lines.push(`${prefix}- 📁 **${dir.name}/**`);
      const childTree = await buildReadmeTree(join(dirPath, dir.name), basePath, indent + 1);
      if (childTree) lines.push(childTree);
    }

    for (const file of files) {
      if (file.name.toUpperCase() === "README.MD") continue; // 跳过自身
      const relPath = relative(basePath, join(dirPath, file.name));
      lines.push(`${prefix}- 📄 [${file.name}](${relPath})`);
    }

    return lines.join("\n");
  }

  return {
    async create(params) {
      const id = crypto.randomUUID();
      const kbPath = getKBPath(id);

      await mkdir(join(kbPath, "sources"), { recursive: true });
      await mkdir(join(kbPath, "content"), { recursive: true });

      // 保存元数据
      const meta = { name: params.name, description: params.description ?? "", createdAt: new Date().toISOString() };
      await writeFile(join(kbPath, "meta.json"), JSON.stringify(meta, null, 2), "utf-8");

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

      // 读取元数据
      const metaPath = join(kbPath, "meta.json");
      let name = id;
      let description = "";
      if (existsSync(metaPath)) {
        try {
          const meta = JSON.parse(await readFile(metaPath, "utf-8"));
          name = meta.name ?? id;
          description = meta.description ?? "";
        } catch { /* ignore */ }
      }

      return {
        id,
        name,
        description,
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

          // 读取元数据
          const metaPath = join(kbPath, "meta.json");
          let name = item.name;
          let description = "";
          if (existsSync(metaPath)) {
            try {
              const meta = JSON.parse(await readFile(metaPath, "utf-8"));
              name = meta.name ?? item.name;
              description = meta.description ?? "";
            } catch { /* ignore */ }
          }

          list.push({
            id: item.name,
            name,
            description,
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
      await rm(kbPath, { recursive: true, force: true });
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
      const title =
        parsed.frontmatter.title ?? basename(filePath, extname(filePath));

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
              if (lines[i]?.toLowerCase().includes(queryLower)) {
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

    // ── 文件写入 ──
    async writeFile(kbId, path, content, tenantId) {
      const contentDir = getContentPath(kbId);
      const filePath = safePath(contentDir, path);

      // 确保父目录存在
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf-8");

      // 自动刷新 README
      await this.generateReadme(kbId, tenantId);
    },

    // ── 文件重命名 ──
    async renameFile(kbId, oldPath, newName, tenantId) {
      const contentDir = getContentPath(kbId);
      const oldFilePath = safePath(contentDir, oldPath);
      if (!existsSync(oldFilePath)) throw aiErrors.kbFileNotFound();

      const newFilePath = join(dirname(oldFilePath), newName);
      // 确保新路径仍在 contentDir 内
      if (!newFilePath.startsWith(contentDir)) throw aiErrors.kbFileNotFound();

      await rename(oldFilePath, newFilePath);

      // 自动刷新 README
      await this.generateReadme(kbId, tenantId);
    },

    // ── 创建目录 ──
    async mkdir(kbId, path, tenantId) {
      const contentDir = getContentPath(kbId);
      const dirPath = safePath(contentDir, path);
      await mkdir(dirPath, { recursive: true });
    },

    // ── 删除文件/目录 ──
    async deleteFile(kbId, path, tenantId) {
      const contentDir = getContentPath(kbId);
      const targetPath = safePath(contentDir, path);
      if (!existsSync(targetPath)) throw aiErrors.kbFileNotFound();

      const stats = await stat(targetPath);
      if (stats.isDirectory()) {
        await rm(targetPath, { recursive: true, force: true });
      } else {
        await unlink(targetPath);
      }

      // 自动刷新 README
      await this.generateReadme(kbId, tenantId);
    },

    // ── 文件上传（含解析）──
    async uploadFile(kbId, fileName, fileBuffer, targetDir, tenantId) {
      const contentDir = getContentPath(kbId);
      const sourcesDir = getSourcesPath(kbId);
      if (!existsSync(contentDir)) throw aiErrors.kbFileNotFound();

      const dir = targetDir ? safePath(contentDir, targetDir) : contentDir;
      await mkdir(dir, { recursive: true });
      await mkdir(sourcesDir, { recursive: true });

      let contentPath: string;
      let sourcePath: string | null = null;

      if (needsParsing(fileName)) {
        // 保存原始文件到 sources/
        const safeFileName = fileName.replace(/[^\w._-]/g, "_");
        await writeFile(join(sourcesDir, safeFileName), fileBuffer);
        sourcePath = safeFileName;

        // 解析为 Markdown
        const parsed = await parseFile(fileBuffer, fileName);
        const mdFileName = fileName.replace(/\.[^.]+$/, ".md");
        const mdFilePath = join(dir, mdFileName);
        await writeFile(mdFilePath, parsed.markdown, "utf-8");
        contentPath = relative(contentDir, mdFilePath);

        // 记录映射关系到 manifest
        const manifestPath = join(getKBPath(kbId), "manifest.json");
        let manifest: { files: Array<{ source: string | null; content: string; title: string; parser: string }> } = { files: [] };
        if (existsSync(manifestPath)) {
          try { manifest = JSON.parse(await readFile(manifestPath, "utf-8")); } catch { /* ignore */ }
        }
        // 移除旧映射
        manifest.files = manifest.files.filter((f) => f.content !== contentPath);
        manifest.files.push({
          source: sourcePath,
          content: contentPath,
          title: parsed.title,
          parser: parsed.parser,
        });
        await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
      } else {
        // 纯文本文件直接保存到 content/
        const filePath = join(dir, fileName);
        await writeFile(filePath, fileBuffer);
        contentPath = relative(contentDir, filePath);
      }

      // 刷新 README
      await this.generateReadme(kbId, tenantId);

      return { contentPath, sourcePath };
    },

    // ── 获取源文件 ──
    async getSourceFile(kbId, path, tenantId) {
      const sourcesDir = getSourcesPath(kbId);
      const filePath = join(sourcesDir, path);
      // 安全检查：确保路径在 sourcesDir 内
      if (!filePath.startsWith(sourcesDir)) return null;
      if (!existsSync(filePath)) return null;

      const buffer = await readFile(filePath);
      const mime = lookup(filePath) || "application/octet-stream";
      return { buffer, mimeType: mime, fileName: basename(filePath) };
    },

    // ── README 自动生成 ──
    async generateReadme(kbId, tenantId) {
      const contentDir = getContentPath(kbId);
      if (!existsSync(contentDir)) return;

      const kbPath = getKBPath(kbId);
      // 读取元数据获取名称
      let kbName = basename(kbPath);
      const metaPath = join(kbPath, "meta.json");
      if (existsSync(metaPath)) {
        try {
          const meta = JSON.parse(await readFile(metaPath, "utf-8"));
          kbName = meta.name ?? kbName;
        } catch { /* ignore */ }
      }
      const fileTree = await buildReadmeTree(contentDir, contentDir);

      const readmeContent = [
        `# ${kbName}`,
        "",
        `> 本文档由系统自动生成，请勿手动修改。`,
        "",
        "## 文件索引",
        "",
        fileTree || "_暂无文件_",
        "",
        `---`,
        `*最后更新：${new Date().toISOString()}*`,
        "",
      ].join("\n");

      await writeFile(join(contentDir, "README.md"), readmeContent, "utf-8");
    },

    async getSourcePath(kbId, contentPath, tenantId) {
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

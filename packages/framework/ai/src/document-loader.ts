/**
 * @ventostack/ai — 文档加载器
 *
 * 将 Markdown 文件系统性地加载到 KnowledgeBase，支持 frontmatter 解析和文本分块。
 * 使用 Bun 内置 API（Bun.file、Bun.glob），零额外依赖。
 */

import type { KnowledgeBase } from "./rag";

/** 文档加载选项 */
export interface DocumentLoaderOptions {
  /** 每个 chunk 的最大字符数，默认 800 */
  chunkSize?: number;
  /** chunk 之间的重叠字符数，默认 150 */
  overlap?: number;
  /** 分隔符，默认 "\n\n" */
  separator?: string;
  /** 文件匹配正则，默认匹配所有 .md 文件 */
  includePattern?: RegExp;
}

/** 加载结果 */
export interface LoadResult {
  /** 成功加载的文档数量 */
  loaded: number;
  /** 总 chunk 数量 */
  chunks: number;
  /** 错误信息列表 */
  errors: string[];
}

/**
 * 解析 Markdown 文件的 frontmatter
 * @param content - 文件内容
 * @returns 解析后的 frontmatter 数据（键值对均为字符串）和正文
 *
 * 支持的 frontmatter 格式：
 * ```
 * ---
 * title: 标题
 * description: 描述
 * ---
 * 正文...
 * ```
 */
export function parseMarkdownFrontmatter(content: string): {
  data: Record<string, string>;
  body: string;
} {
  const trimmed = content.trim();
  if (!trimmed.startsWith("---")) {
    return { data: {}, body: trimmed };
  }

  const endIdx = trimmed.indexOf("---", 3);
  if (endIdx === -1) {
    return { data: {}, body: trimmed };
  }

  const frontmatter = trimmed.slice(3, endIdx).trim();
  const body = trimmed.slice(endIdx + 3).trim();
  const data: Record<string, string> = {};

  for (const line of frontmatter.split("\n")) {
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0 || trimmedLine.startsWith("#")) {
      continue;
    }
    const colonIdx = trimmedLine.indexOf(":");
    if (colonIdx === -1) {
      continue;
    }
    const key = trimmedLine.slice(0, colonIdx).trim();
    let value = trimmedLine.slice(colonIdx + 1).trim();
    // 去除可能的 YAML 引号
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key.length > 0) {
      data[key] = value;
    }
  }

  return { data, body };
}

/**
 * 从文件路径推断文档类别
 * @param filePath - 文件路径
 * @returns 类别名称
 */
function inferCategory(filePath: string): string | undefined {
  const match = filePath.match(/content\/docs\/([^/]+)\//);
  return match?.[1];
}

/**
 * 从文件路径提取文档标题
 * @param filePath - 文件路径
 * @returns 文件名（不含扩展名）
 */
function inferTitleFromPath(filePath: string): string {
  const base = filePath.split("/").pop() ?? "";
  return base.replace(/\.mdx?$/i, "");
}

/**
 * 将目录下的 Markdown 文件加载到知识库
 * @param dirPath - 文档目录路径
 * @param kb - 知识库实例
 * @param options - 加载选项
 * @returns 加载结果
 */
export async function loadDocumentsFromDirectory(
  dirPath: string,
  kb: KnowledgeBase,
  options: DocumentLoaderOptions = {},
): Promise<LoadResult> {
  const { chunkSize = 800, overlap = 150, separator = "\n\n", includePattern } = options;

  const globPattern = `${dirPath.replace(/\/$/, "")}/**/*.{md,mdx}`;
  const glob = new Bun.Glob(globPattern);
  const result: LoadResult = { loaded: 0, chunks: 0, errors: [] };

  for await (const filePath of glob.scan()) {
    // 过滤不符合正则的文件
    if (includePattern && !includePattern.test(filePath)) {
      continue;
    }

    try {
      const file = Bun.file(filePath);
      const content = await file.text();
      const { data, body } = parseMarkdownFrontmatter(content);
      const category = inferCategory(filePath);
      const title = data.title ?? inferTitleFromPath(filePath);

      // 跳过空正文
      if (body.trim().length === 0) {
        continue;
      }

      // 分块
      const chunks = kb.chunk(body, {
        maxChunkSize: chunkSize,
        overlap,
        separator,
      });

      for (const chunk of chunks) {
        kb.add({
          content: chunk,
          metadata: {
            source: filePath,
            title,
            description: data.description,
            category,
          },
        });
        result.chunks++;
      }

      result.loaded++;
    } catch (err) {
      result.errors.push(
        `Failed to load "${filePath}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return result;
}

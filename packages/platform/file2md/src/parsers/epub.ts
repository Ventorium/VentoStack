/**
 * EPUB → Markdown 解析器
 *
 * EPUB = ZIP 内含 XHTML 章节文件。
 * 提取每章内容，转换为 Markdown。
 */
import type { FileParser, ParseInput, ParseContext, ConvertResult, MdOutput } from "../types";
import { readZipEntries } from "./zip-reader";

export function createEpubParser(): FileParser {
  return {
    name: "epub",
    extensions: [".epub"],

    canHandle(fileName: string): boolean {
      return fileName.toLowerCase().endsWith(".epub");
    },

    async parse(input: ParseInput, ctx: ParseContext): Promise<ConvertResult> {
      const { buffer, fileName } = input;
      const baseName = fileName.replace(/\.epub$/i, "");

      const entries = readZipEntries(buffer);

      // ── 提取元数据 ──
      const containerEntry = entries.find((e) => e.name === "META-INF/container.xml");
      const opfPath = extractOpfPath(containerEntry?.data.toString("utf-8") ?? "");
      const opfEntry = opfPath ? entries.find((e) => e.name === opfPath) : undefined;

      const metadata = extractEpubMetadata(opfEntry?.data.toString("utf-8") ?? "");
      const baseTitle = metadata.title ?? baseName;
      const opfDir = opfPath ? opfPath.replace(/[^/]+$/, "") : "";

      // ── 提取章节顺序 ──
      const spineItems = extractSpineItems(opfEntry?.data.toString("utf-8") ?? "");

      // ── 按顺序解析每章 ──
      const chapters: Array<{ title: string; content: string }> = [];

      for (const itemHref of spineItems) {
        const fullPath = opfDir + itemHref;
        const entry = entries.find((e) => e.name === fullPath || e.name === itemHref);
        if (!entry) continue;

        const xhtml = entry.data.toString("utf-8");
        const chapterTitle = extractChapterTitle(xhtml) ?? itemHref;
        const chapterContent = xhtmlBodyToMarkdown(xhtml);

        if (chapterContent.trim()) {
          // Strip leading heading if it matches the chapter title (avoid duplication)
          const escaped = chapterTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const titlePattern = new RegExp(`^##+\\s+${escaped}\\s*\\n?`, "i");
          const cleaned = chapterContent.replace(titlePattern, "").trim();

          chapters.push({ title: chapterTitle, content: cleaned || chapterContent.trim() });
        }
      }

      // ── 构建 Markdown ──
      const lines: string[] = [];
      lines.push(`# ${baseTitle}`);
      lines.push("");

      const metaParts: string[] = [];
      const author = metadata.creator ?? metadata.author;
      if (author) metaParts.push(`作者：${author}`);
      if (metadata.language) metaParts.push(`语言：${metadata.language}`);
      if (metadata.publisher) metaParts.push(`出版商：${metadata.publisher}`);
      metaParts.push(`章节数：${chapters.length}`);

      if (metaParts.length > 0) {
        lines.push(`> ${metaParts.join(" | ")}`);
        lines.push("");
        lines.push("---");
        lines.push("");
      }

      // 目录
      lines.push("## 目录");
      lines.push("");
      for (let i = 0; i < chapters.length; i++) {
        lines.push(`${i + 1}. ${chapters[i]!.title}`);
      }
      lines.push("");
      lines.push("---");
      lines.push("");

      // 章节内容
      for (const chapter of chapters) {
        lines.push(`## ${chapter.title}`);
        lines.push("");
        lines.push(chapter.content);
        lines.push("");
        lines.push("---");
        lines.push("");
      }

      return {
        sourceFileName: fileName,
        outputs: [{
          relativePath: `${baseName}.md`,
          content: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
          title: baseTitle,
          metadata: { ...metadata, chapterCount: chapters.length },
        }],
        parser: "epub",
        duration: 0,
        warnings: [],
        metadata: { ...metadata, chapterCount: chapters.length },
      };
    },
  };
}

// ── 辅助函数 ──

function extractOpfPath(containerXml: string): string | undefined {
  const match = containerXml.match(/full-path="([^"]+)"/);
  return match?.[1];
}

function extractEpubMetadata(opfXml: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const tags = ["dc:title", "dc:creator", "dc:language", "dc:publisher", "dc:date", "dc:identifier"];
  for (const tag of tags) {
    const regex = new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`);
    const match = opfXml.match(regex);
    if (match?.[1]) {
      const key = tag.replace("dc:", "");
      meta[key] = match[1]!.trim();
    }
  }
  return meta;
}

function extractSpineItems(opfXml: string): string[] {
  const manifest: Record<string, string> = {};
  const manifestRegex = /<item\b[^>]*id="([^"]*)"[^>]*href="([^"]*)"[^>]*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = manifestRegex.exec(opfXml)) !== null) {
    manifest[m[1]!] = m[2]!;
  }

  const items: string[] = [];
  const spineRegex = /<itemref\b[^>]*idref="([^"]*)"[^>]*\/>/g;
  let s: RegExpExecArray | null;
  while ((s = spineRegex.exec(opfXml)) !== null) {
    const href = manifest[s[1]!];
    if (href) items.push(href);
  }
  return items;
}

function extractChapterTitle(xhtml: string): string | undefined {
  for (const tag of ["h1", "h2", "h3"]) {
    const match = xhtml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
    if (match?.[1]) return stripTags(match[1]).trim();
  }
  return undefined;
}

/** 只提取 <body> 内容转为 Markdown */
function xhtmlBodyToMarkdown(xhtml: string): string {
  // 提取 body 内容（如果有的话），否则用全部内容
  const bodyMatch = xhtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let content = bodyMatch?.[1] ?? xhtml;

  // 移除 head 标签内容
  content = content.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "");

  // 标题
  for (let level = 1; level <= 6; level++) {
    const tag = `h${level}`;
    const prefix = "#".repeat(level + 1);
    content = content.replace(
      new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"),
      `\n${prefix} $1\n`,
    );
  }

  content = content
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n$1\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<hr\s*\/?>/gi, "\n---\n")
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n")
    .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, "**$1**")
    .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, "*$1*")
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    .replace(/<img\b[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, "![$2]($1)")
    .replace(/<img\b[^>]*src="([^"]*)"[^>]*\/?>/gi, "![]($1)");

  return stripTags(content)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripTags(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-zA-Z]+;/g, "");
}

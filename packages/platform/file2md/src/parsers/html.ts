/**
 * HTML → Markdown 解析器
 *
 * 提取正文内容，去除 script/style/nav/footer 等非内容元素。
 * 转换为 Markdown 格式。
 */
import { extname } from "node:path";
import type { FileParser, ParseInput, ParseContext, ConvertResult } from "../types";

export function createHtmlParser(): FileParser {
  return {
    name: "html",
    extensions: [".html", ".htm", ".xhtml"],

    canHandle(fileName: string): boolean {
      const ext = extname(fileName).toLowerCase();
      return ext === ".html" || ext === ".htm" || ext === ".xhtml";
    },

    async parse(input: ParseInput, _ctx: ParseContext): Promise<ConvertResult> {
      const { buffer, fileName } = input;
      const baseName = fileName.replace(/\.[^.]+$/, "");
      const html = buffer.toString("utf-8");

      const md = htmlToMarkdown(html, baseName);

      return {
        sourceFileName: fileName,
        outputs: [{ relativePath: `${baseName}.md`, content: md, title: baseName }],
        parser: "html",
        duration: 0,
        warnings: [],
        metadata: { size: buffer.length },
      };
    },
  };
}

/**
 * HTML → Markdown 转换（纯正则实现，零依赖）
 */
function htmlToMarkdown(html: string, fallbackTitle: string): string {
  // 移除不需要的标签及内容
  let content = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // 提取标题
  const titleMatch = content.match(/<title[^>]*>([^<]*)<\/title>/i);
  const h1Match = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = stripTags(titleMatch?.[1] ?? h1Match?.[1] ?? fallbackTitle).trim();

  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");

  // 从 body 提取内容
  const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch?.[1] ?? content;

  // Step 1: 处理块级元素（不 strip 内容中的 HTML 标签）
  let processed = body
    // 标题
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, t) => `\n# ${stripTags(t).trim()}\n`)
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, t) => `\n## ${stripTags(t).trim()}\n`)
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, t) => `\n### ${stripTags(t).trim()}\n`)
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, t) => `\n#### ${stripTags(t).trim()}\n`)
    .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_, t) => `\n##### ${stripTags(t).trim()}\n`)
    .replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (_, t) => `\n###### ${stripTags(t).trim()}\n`)
    // 段落 — 保留内联标签用于后续处理
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n$1\n")
    // 换行
    .replace(/<br\s*\/?>/gi, "\n")
    // 水平线
    .replace(/<hr\s*\/?>/gi, "\n---\n")
    // 列表项 — 保留内联标签
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n")
    // 表格
    .replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, (_, rowContent) => {
      const cells = [...rowContent.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map((m) => (m[1] ?? "").replace(/<[^>]+>/g, "").trim() || " ");
      return "| " + cells.join(" | ") + " |\n";
    });

  // Step 2: 处理内联元素
  processed = processed
    // 加粗
    .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**")
    // 斜体
    .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*")
    // 链接
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    // 图片
    .replace(/<img\b[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, "![$2]($1)")
    .replace(/<img\b[^>]*src="([^"]*)"[^>]*\/?>/gi, "![]($1)");

  // Step 3: 移除所有剩余标签，解码 HTML 实体
  const cleaned = stripTags(processed);

  // 清理多余空行
  const final = cleaned
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  lines.push(final);

  return lines.join("\n");
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

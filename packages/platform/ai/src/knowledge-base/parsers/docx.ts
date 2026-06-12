/**
 * DOCX → Markdown 解析器
 * 使用 mammoth 提取 HTML，再转换为 Markdown
 */

import mammoth from "mammoth";

export interface ParsedDocument {
  content: string;
  title?: string;
  warnings: string[];
}

/**
 * 将 DOCX 文件内容解析为 Markdown
 * @param buffer DOCX 文件的 Buffer
 * @param fileName 原始文件名
 */
export async function parseDocx(buffer: Buffer, fileName: string): Promise<ParsedDocument> {
  const result = await mammoth.convertToHtml({ buffer }, {
    styleMap: [
      "p[style-name='Heading 1'] => h1:fresh",
      "p[style-name='Heading 2'] => h2:fresh",
      "p[style-name='Heading 3'] => h3:fresh",
      "p[style-name='Title'] => h1:fresh",
      "p[style-name='Subtitle'] => h2:fresh",
    ],
  });

  const title = fileName.replace(/\.docx$/i, "");
  const html = result.value;

  // HTML → Markdown 转换
  const markdown = htmlToMarkdown(html, title);

  return {
    content: markdown,
    title,
    warnings: result.messages.map((m) => m.message),
  };
}

/**
 * 简易 HTML → Markdown 转换
 */
function htmlToMarkdown(html: string, fallbackTitle: string): string {
  const lines: string[] = [];
  lines.push(`# ${fallbackTitle}`);
  lines.push("");

  let text = html;

  // 标题转换
  text = text.replace(/<h1[^>]*>(.*?)<\/h1>/gi, (_, content) => `\n# ${stripHtml(content)}\n`);
  text = text.replace(/<h2[^>]*>(.*?)<\/h2>/gi, (_, content) => `\n## ${stripHtml(content)}\n`);
  text = text.replace(/<h3[^>]*>(.*?)<\/h3>/gi, (_, content) => `\n### ${stripHtml(content)}\n`);
  text = text.replace(/<h4[^>]*>(.*?)<\/h4>/gi, (_, content) => `\n#### ${stripHtml(content)}\n`);

  // 加粗和斜体
  text = text.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
  text = text.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
  text = text.replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*");
  text = text.replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*");

  // 列表
  text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n");
  text = text.replace(/<\/?[uo]l[^>]*>/gi, "\n");

  // 段落和换行
  text = text.replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");

  // 链接
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");

  // 表格（简单处理）
  text = text.replace(/<table[^>]*>/gi, "\n");
  text = text.replace(/<\/table>/gi, "\n");
  text = text.replace(/<tr[^>]*>/gi, "");
  text = text.replace(/<\/tr>/gi, "\n");
  text = text.replace(/<t[dh][^>]*>(.*?)<\/t[dh]>/gi, "| $1 ");

  // 移除剩余 HTML 标签
  text = stripHtml(text);

  // 清理多余空行
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  lines.push(text);
  return lines.join("\n");
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

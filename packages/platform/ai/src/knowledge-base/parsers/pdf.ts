/**
 * PDF → Markdown 解析器
 * 使用 unpdf 提取文本，转换为 Markdown 格式
 */

import { extractText, getMeta } from "unpdf";

export interface ParsedDocument {
  content: string;
  pageCount: number;
  title?: string;
}

/**
 * 将 PDF 文件内容解析为 Markdown
 * @param buffer PDF 文件的 Buffer
 * @param fileName 原始文件名
 */
export async function parsePdf(buffer: Buffer, fileName: string): Promise<ParsedDocument> {
  const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const { text, totalPages } = await extractText(uint8);
  const meta = await getMeta(uint8);

  const title = (meta as { info?: { Title?: string } }).info?.Title || fileName.replace(/\.pdf$/i, "");

  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");

  const author = (meta as { info?: { Author?: string } }).info?.Author;
  if (author) {
    lines.push(`> 作者：${author}`);
    lines.push("");
  }

  lines.push(`> 来源文件：${fileName}（共 ${totalPages} 页）`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // 处理文本内容
  const content = (Array.isArray(text) ? text.join("\n\n") : String(text))
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // 尝试识别段落和标题
  const paragraphs = content.split(/\n\n+/);
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // 简单启发式：全大写或短行可能是标题
    if (trimmed.length < 80 && trimmed === trimmed.toUpperCase() && /[A-Z\u4e00-\u9fff]/.test(trimmed)) {
      lines.push(`## ${trimmed}`);
      lines.push("");
    } else {
      lines.push(trimmed.replace(/\n/g, " "));
      lines.push("");
    }
  }

  return {
    content: lines.join("\n"),
    pageCount: totalPages,
    title,
  };
}

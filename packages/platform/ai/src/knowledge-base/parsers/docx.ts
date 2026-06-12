/**
 * DOCX → Markdown 解析器
 * 零外部依赖：DOCX = ZIP 内含 XML，直接解析
 */

import { readZipEntries } from "./zip-reader";

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
  const entries = readZipEntries(buffer);

  // 读取 document.xml（主文档内容）
  const docEntry = entries.find((e) => e.name === "word/document.xml");
  if (!docEntry) {
    return { content: `# ${fileName.replace(/\.docx$/i, "")}\n\n> 无法解析 DOCX 文件：缺少 document.xml`, title: fileName, warnings: ["Missing word/document.xml"] };
  }

  const xml = docEntry.data.toString("utf-8");
  const title = fileName.replace(/\.docx$/i, "");
  const markdown = docxXmlToMarkdown(xml, title);

  return { content: markdown, title, warnings: [] };
}

/**
 * 将 DOCX 的 document.xml 转换为 Markdown
 */
function docxXmlToMarkdown(xml: string, fallbackTitle: string): string {
  const lines: string[] = [];
  lines.push(`# ${fallbackTitle}`);
  lines.push("");

  // 提取所有段落 <w:p>...</w:p>
  const paraRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  let paraMatch: RegExpExecArray | null;

  while ((paraMatch = paraRegex.exec(xml)) !== null) {
    const paraXml = paraMatch[1];

    // 检查段落样式（标题等）
    const styleMatch = paraXml.match(/<w:pStyle\b[^>]*w:val="([^"]*)"/);
    const style = styleMatch?.[1] ?? "";

    // 提取段落内的文本
    const textParts: string[] = [];
    // 提取文本运行 <w:t>...</w:t>
    const textRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let textMatch: RegExpExecArray | null;
    while ((textMatch = textRegex.exec(paraXml)) !== null) {
      textParts.push(textMatch[1]);
    }

    const text = textParts.join("").trim();
    if (!text) continue;

    // 检查是否有加粗
    const isBold = /<w:b\b/.test(paraXml);
    // 检查是否有斜体
    const isItalic = /<w:i\b/.test(paraXml);

    // 根据样式转换
    if (style.startsWith("Heading1") || style === "Title") {
      lines.push(`# ${text}`);
    } else if (style.startsWith("Heading2") || style === "Subtitle") {
      lines.push(`## ${text}`);
    } else if (style.startsWith("Heading3")) {
      lines.push(`### ${text}`);
    } else if (style.startsWith("Heading4")) {
      lines.push(`#### ${text}`);
    } else if (style.startsWith("List")) {
      lines.push(`- ${formatInline(text, isBold, isItalic)}`);
    } else {
      lines.push(formatInline(text, isBold, isItalic));
    }
    lines.push("");
  }

  // 提取表格 <w:tbl>...</w:tbl>
  const tableRegex = /<w:tbl\b[^>]*>([\s\S]*?)<\/w:tbl>/g;
  let tableMatch: RegExpExecArray | null;
  while ((tableMatch = tableRegex.exec(xml)) !== null) {
    lines.push("");
    const rowRegex = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g;
    let rowMatch: RegExpExecArray | null;
    let isFirstRow = true;
    while ((rowMatch = rowRegex.exec(tableMatch[1])) !== null) {
      const cellRegex = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g;
      const cells: string[] = [];
      let cellMatch: RegExpExecArray | null;
      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        const cellTexts: string[] = [];
        const cellTextRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
        let ct: RegExpExecArray | null;
        while ((ct = cellTextRegex.exec(cellMatch[1])) !== null) {
          cellTexts.push(ct[1]);
        }
        cells.push(cellTexts.join("").trim() || " ");
      }
      lines.push(`| ${cells.join(" | ")} |`);
      if (isFirstRow) {
        lines.push(`| ${cells.map(() => "---").join(" | ")} |`);
        isFirstRow = false;
      }
    }
    lines.push("");
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function formatInline(text: string, bold: boolean, italic: boolean): string {
  let result = text;
  if (bold) result = `**${result}**`;
  if (italic) result = `*${result}*`;
  return result;
}

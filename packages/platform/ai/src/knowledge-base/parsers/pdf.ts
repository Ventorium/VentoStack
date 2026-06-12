/**
 * PDF → Markdown 解析器
 * 使用 @llamaindex/liteparse（Rust 原生，内置 Tesseract OCR，支持远程 PaddleOCR）
 */

import { LiteParse } from "@llamaindex/liteparse";

export interface ParsedDocument {
  content: string;
  pageCount: number;
  title?: string;
}

export interface PdfParseOptions {
  ocrEnabled?: boolean;
  ocrLanguage?: string;
  ocrServerUrl?: string;
}

/**
 * 将 PDF 文件内容解析为 Markdown
 * @param buffer PDF 文件的 Buffer
 * @param fileName 原始文件名
 * @param options OCR 配置选项
 */
export async function parsePdf(
  buffer: Buffer,
  fileName: string,
  options: PdfParseOptions = {},
): Promise<ParsedDocument> {
  const lp = new LiteParse({
    ocrEnabled: options.ocrEnabled ?? true,
    ocrLanguage: options.ocrLanguage,
    ocrServerUrl: options.ocrServerUrl || undefined,
    outputFormat: "text",
    quiet: true,
  });

  const result = await lp.parse(buffer);

  const title = fileName.replace(/\.pdf$/i, "");
  const lines: string[] = [];

  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`> 来源文件：${fileName}（共 ${result.pages.length} 页）`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (let i = 0; i < result.pages.length; i++) {
    const page = result.pages[i];
    const pageText = (page.text ?? "").trim();
    if (pageText) {
      lines.push(pageText);
      lines.push("");
    }
  }

  return {
    content: lines.join("\n"),
    pageCount: result.pages.length,
    title,
  };
}

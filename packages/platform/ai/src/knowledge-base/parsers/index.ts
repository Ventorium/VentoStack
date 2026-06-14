/**
 * 文件解析器入口
 * 委托给 @ventostack/file2md 进行实际解析
 */
import { extname } from "node:path";
import type { OCRService } from "@ventostack/file2md";

export interface ParsedResult {
  markdown: string;
  title: string;
  parser: string;
  sourceFileName: string;
}

/**
 * 解析文件为 Markdown（委托给 @ventostack/file2md）
 */
export async function parseFile(
  buffer: Buffer,
  fileName: string,
  ocrOptions?: { ocrEnabled?: boolean; ocrLanguage?: string; ocrServerUrl?: string },
): Promise<ParsedResult> {
  const { createFile2MdModule, createRemoteOCRService } = await import("@ventostack/file2md");

  let ocrService: OCRService | undefined;
  if (ocrOptions?.ocrEnabled && ocrOptions?.ocrServerUrl) {
    ocrService = createRemoteOCRService({
      serverUrl: ocrOptions.ocrServerUrl,
      defaultLanguage: ocrOptions.ocrLanguage ?? "ch",
    });
  }

  const file2md = createFile2MdModule({
    ocr: ocrService,
    defaultCleaner: { enabled: true },
  });

  const result = await file2md.convertFile(buffer, fileName);
  const mainOutput = result.outputs[0];
  if (!mainOutput) {
    throw new Error(`解析 ${fileName} 未产生任何输出`);
  }

  return {
    markdown: mainOutput.content,
    title: mainOutput.title,
    parser: result.parser,
    sourceFileName: result.sourceFileName,
  };
}

/**
 * 判断文件是否需要特殊解析（非纯文本格式）
 */
export function needsParsing(fileName: string): boolean {
  const ext = extname(fileName).toLowerCase();
  return [
    ".pdf", ".docx", ".doc", ".pptx", ".ppt", ".xlsx", ".xls",
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff", ".tif",
    ".html", ".htm", ".xhtml", ".epub", ".zip",
  ].includes(ext);
}

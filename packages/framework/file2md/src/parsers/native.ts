/**
 * Rust file-parser 委托解析器
 *
 * 文档（doc/docx/ppt/pptx/xls/xlsx/odt/ods/odp/rtf/epub/csv）、
 * PDF、HTML、图片（OCR）全部委托 @ventostack/file-parser（Rust napi）。
 * 文本类扩展不在此列，由 fence 解析器在本地兜底。
 */
import { extname } from "node:path";
import type {
  FileParser, ParseInput, ParseContext, ConvertResult, OCRService,
} from "../types";

/** Rust 侧 SUPPORTED_FORMATS 的 document/pdf/html/image 全集 */
const NATIVE_EXTENSIONS = [
  ".doc", ".docx", ".docm",
  ".ppt", ".pptx", ".pptm", ".ppsx", ".ppsm", ".pps", ".pot",
  ".xls", ".xlsx", ".xlsm", ".xlsb",
  ".odt", ".ods", ".odp", ".rtf", ".epub", ".csv",
  ".pdf",
  ".html", ".htm", ".xhtml",
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff",
];

export function createNativeParser(): FileParser {
  return {
    name: "file-parser",
    extensions: NATIVE_EXTENSIONS,

    canHandle(fileName: string): boolean {
      return NATIVE_EXTENSIONS.includes(extname(fileName).toLowerCase());
    },

    async parse(input: ParseInput, ctx: ParseContext): Promise<ConvertResult> {
      const { buffer, fileName } = input;
      const native = await import("@ventostack/file-parser");
      const markdown = await native.convertBytes(buffer, fileName, buildOptionsJson(ctx.ocr));

      const baseName = fileName.replace(/\.[^.]+$/, "") || fileName;
      // 标题取输出的首个 `# ` 标题，没有则退回文件名
      const title = markdown.match(/^# (.+)$/m)?.[1]?.trim() || baseName;

      return {
        sourceFileName: fileName,
        outputs: [{ relativePath: `${baseName}.md`, content: markdown, title }],
        parser: "file-parser",
        duration: 0,
        warnings: [],
        metadata: {},
      };
    },
  };
}

/**
 * OCRService 配置 → napi `convertBytes` 的 optionsJson：
 * `{paddleOcr: {endpoint, headers, model}, convert: {ocrLanguage}}`。
 * 未配置 OCR 时返回 undefined（napi 侧走无 provider 路径）。
 */
export function buildOptionsJson(ocr?: OCRService): string | undefined {
  if (!ocr?.endpoint) return undefined;
  const paddleOcr: Record<string, unknown> = { endpoint: ocr.endpoint };
  if (ocr.headers && Object.keys(ocr.headers).length > 0) paddleOcr.headers = ocr.headers;
  if (ocr.model) paddleOcr.model = ocr.model;
  const options: Record<string, unknown> = { paddleOcr };
  if (ocr.language) options.convert = { ocrLanguage: ocr.language };
  return JSON.stringify(options);
}

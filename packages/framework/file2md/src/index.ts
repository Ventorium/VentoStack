/**
 * @ventostack/file2md — 任意文件 → Markdown 转换服务
 *
 * 主解析委托 @ventostack/file-parser（Rust napi）：
 * DOCX/DOC/PPTX/PPT/XLSX/XLS/ODT/PDF/HTML/EPUB/CSV/图片(OCR)；
 * 本地仅保留 ZIP 解包与文本（markdown/代码/结构化）兜底。
 *
 * @example
 * ```ts
 * import { createFile2MdModule, createRemoteOCRService } from "@ventostack/file2md";
 *
 * const file2md = createFile2MdModule({
 *   ocr: createRemoteOCRService({
 *     serverUrl: "https://…/api/v2/ocr/jobs",
 *     token: "…",
 *   }),
 * });
 *
 * const result = await file2md.convertFile(buffer, "report.pdf");
 * console.log(result.outputs[0].content); // Markdown 内容
 * ```
 */

// 模块工厂
export { createFile2MdModule, type File2MdModuleDeps } from './module';

// 核心类型
export type {
  File2MdModule,
  File2MdConfig,
  ConvertResult,
  MdOutput,
  ConvertFileOptions,
  ConvertBatchOptions,
  ConvertProgressEvent,
  ProgressEventType,
  FileParser,
  ParseInput,
  ParseContext,
  OCRService,
  CleanerConfig,
  CleanerContext,
  CleanerRule,
} from './types';

// OCR 配置工厂
export { createRemoteOCRService, type RemoteOCRConfig } from './ocr/remote';
export { testOcrService, type OcrTestResult } from './ocr/test';

// 解析器（单独导出供自定义组合）
export {
  createNativeParser,
  createFenceParser,
  createZipParser,
  createUnsupportedParser,
  registerAllParsers,
} from './parsers';

// 清洗引擎
export {
  createMarkdownCleaner,
  unicodeRule,
  whitespaceRule,
  blankLinesRule,
  headingsRule,
  listsRule,
  tablesRule,
  boilerplateRule,
  duplicatesRule,
  linkCleanupRule,
} from './cleaner';

// 注册表
export { createParserRegistry, type ParserRegistry } from './registry';

// 转换器
export { createConverter, type Converter } from './converter';

// MIME 工具
export { lookupMimeType } from './mime';
export { readZipEntries } from './parsers/zip-reader';

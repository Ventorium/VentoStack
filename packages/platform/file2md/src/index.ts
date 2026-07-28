/**
 * @ventostack/file2md — 任意文件 → Markdown 转换服务
 *
 * 支持格式：Markdown, 纯文本, 源代码, JSON/YAML/XML/CSV, 图片(OCR),
 * DOCX/PPTX/XLSX, DOC/PPT/XLS(LibreOffice), PDF, HTML, EPUB, ZIP
 *
 * @example
 * ```ts
 * import { createFile2MdModule } from "@ventostack/file2md";
 *
 * const file2md = createFile2MdModule({
 *   ocr: createRemoteOCRService({ serverUrl: "http://localhost:8866/predict/ocr_system" }),
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
  OCROptions,
  OCRResult,
  OCRBlock,
  CleanerConfig,
  CleanerContext,
  CleanerRule,
} from './types';

// OCR 服务
export { createRemoteOCRService, type RemoteOCRConfig } from './ocr/remote';

// 解析器（单独导出供自定义组合）
export {
  createTextParser,
  createCodeParser,
  createMarkdownParser,
  createStructuredParser,
  createImageParser,
  createDocxParser,
  createPptxParser,
  createXlsxParser,
  createLegacyOfficeParser,
  createPdfParser,
  createZipParser,
  createHtmlParser,
  createEpubParser,
  createUnsupportedParser,
  registerAllParsers,
} from './parsers';

// 清洗引擎
export {
  createMarkdownCleaner,
  unicodeRule,
  whitespaceRule,
  htmlArtifactsRule,
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

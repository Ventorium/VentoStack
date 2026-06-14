/**
 * @ventostack/file2md — 核心类型定义
 *
 * 任意文件 → Markdown 转换服务
 */

// ─── 转换结果 ───

/** 单个 Markdown 输出文件 */
export interface MdOutput {
  /** 相对路径（多文件输出时保持层级） */
  relativePath: string;
  /** Markdown 内容 */
  content: string;
  /** 内容标题 */
  title: string;
  /** 元数据（页码、sheet名 等） */
  metadata?: Record<string, unknown>;
}

/** 转换结果 */
export interface ConvertResult {
  /** 原始文件名 */
  sourceFileName: string;
  /** 原始文件保存路径（如果保留了源文件） */
  sourcePath?: string;
  /** 输出的 md 文件列表 */
  outputs: MdOutput[];
  /** 使用的解析器名称 */
  parser: string;
  /** 转换耗时(ms) */
  duration: number;
  /** 警告信息 */
  warnings: string[];
  /** 提取的元数据 */
  metadata: Record<string, unknown>;
}

// ─── 进度事件 ───

export type ProgressEventType =
  | "start"
  | "file_start"
  | "file_done"
  | "ocr_start"
  | "ocr_done"
  | "parse_start"
  | "parse_done"
  | "clean_start"
  | "clean_done"
  | "error"
  | "complete";

export interface ConvertProgressEvent {
  type: ProgressEventType;
  /** 当前处理的文件名 */
  fileName: string;
  /** 附加信息 */
  message?: string;
  /** 进度计数 */
  progress?: { current: number; total: number };
  /** 错误（type=error 时） */
  error?: Error;
}

// ─── 解析器 ───

export interface ParseInput {
  buffer: Buffer;
  fileName: string;
  mimeType?: string;
}

export interface ParseContext {
  /** OCR 服务 */
  ocr?: OCRService;
  /** 清洗配置 */
  cleaner?: CleanerConfig;
  /** 进度回调 */
  onProgress?: (event: ConvertProgressEvent) => void;
  /** 临时目录 */
  tmpDir: string;
  /** 递归深度限制（用于 ZIP） */
  maxDepth?: number;
  /** 当前递归深度 */
  currentDepth?: number;
  /** 源文件保存目录 */
  sourceDir?: string;
}

export interface FileParser {
  /** 解析器名称 */
  name: string;
  /** 支持的文件扩展名（含点号，小写） */
  extensions: string[];
  /** 是否能处理此文件 */
  canHandle(fileName: string, mimeType?: string): boolean;
  /** 执行解析 */
  parse(input: ParseInput, ctx: ParseContext): Promise<ConvertResult>;
}

// ─── OCR ───

export interface OCROptions {
  /** 语言（如 "chi_sim", "eng"） */
  language?: string;
  /** 是否预处理图片（灰度、二值化、去噪） */
  preprocess?: boolean;
}

export interface OCRResult {
  /** 识别文本 */
  text: string;
  /** 置信度 0-1 */
  confidence: number;
  /** 识别语言 */
  language?: string;
  /** 文本块（含位置信息） */
  blocks?: OCRBlock[];
}

export interface OCRBlock {
  text: string;
  /** 边界框 [x1, y1, x2, y2] */
  bbox: [number, number, number, number];
  confidence: number;
}

export interface OCRService {
  /** 识别图片内容 */
  recognize(imageBuffer: Buffer, options?: OCROptions): Promise<OCRResult>;
  /** 服务名称 */
  name: string;
}

// ─── 清洗 ───

export interface CleanerConfig {
  /** 是否启用清洗 */
  enabled?: boolean;
  /** 启用的规则列表（为空则启用所有） */
  enabledRules?: string[];
  /** 禁用的规则列表 */
  disabledRules?: string[];
  /** 自定义规则参数 */
  ruleOptions?: Record<string, unknown>;
}

export interface CleanerContext {
  fileName: string;
  metadata: Record<string, unknown>;
}

export interface CleanerRule {
  /** 规则名称 */
  name: string;
  /** 规则描述 */
  description: string;
  /** 优先级（越小越先执行） */
  priority: number;
  /** 执行清洗 */
  clean(markdown: string, context: CleanerContext): string;
}

// ─── 模块配置 ───

export interface File2MdConfig {
  /** OCR 服务 */
  ocr?: OCRService;
  /** 默认清洗配置 */
  defaultCleaner?: CleanerConfig;
  /** LibreOffice 路径（默认 "soffice"） */
  libreofficePath?: string;
  /** 最大文件大小（字节，默认 100MB） */
  maxFileSize?: number;
  /** ZIP 递归最大深度（默认 3） */
  maxZipDepth?: number;
  /** 临时目录 */
  tmpDir?: string;
}

export interface File2MdModule {
  /** 转换单个文件 */
  convertFile(
    buffer: Buffer,
    fileName: string,
    options?: ConvertFileOptions,
  ): Promise<ConvertResult>;

  /** 批量转换 */
  convertBatch(
    files: Array<{ buffer: Buffer; fileName: string }>,
    options?: ConvertBatchOptions,
  ): Promise<ConvertResult[]>;

  /** 获取支持的文件格式列表 */
  getSupportedFormats(): string[];

  /** 注册自定义解析器 */
  registerParser(parser: FileParser): void;

  /** 注册自定义清洗规则 */
  registerRule(rule: CleanerRule): void;
}

export interface ConvertFileOptions {
  /** 覆盖模块级 OCR 服务 */
  ocr?: OCRService;
  /** 覆盖模块级清洗配置 */
  cleaner?: CleanerConfig;
  /** 进度回调 */
  onProgress?: (event: ConvertProgressEvent) => void;
  /** 是否保留源文件到指定目录 */
  sourceDir?: string;
}

export interface ConvertBatchOptions extends ConvertFileOptions {
  /** 并发数（默认 3） */
  concurrency?: number;
  /** 批量进度回调 */
  onBatchProgress?: (event: ConvertProgressEvent) => void;
}

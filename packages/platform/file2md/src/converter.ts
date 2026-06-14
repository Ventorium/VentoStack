/**
 * 核心转换编排器
 * 协调解析器注册表、OCR 服务、清洗引擎和进度追踪
 */
import { extname, join } from "node:path";
import { mkdir, writeFile, cp } from "node:fs/promises";
import type {
  ConvertResult, ConvertFileOptions, ConvertBatchOptions,
  File2MdConfig, ParseContext, ConvertProgressEvent,
} from "./types";
import { createParserRegistry, type ParserRegistry } from "./registry";
import { registerAllParsers } from "./parsers";
import { createMarkdownCleaner } from "./cleaner";
import { createProgressEmitter } from "./progress/emitter";

export interface Converter {
  convertFile(
    buffer: Buffer,
    fileName: string,
    options?: ConvertFileOptions,
  ): Promise<ConvertResult>;

  convertBatch(
    files: Array<{ buffer: Buffer; fileName: string }>,
    options?: ConvertBatchOptions,
  ): Promise<ConvertResult[]>;

  getSupportedFormats(): string[];
  getRegistry(): ParserRegistry;
}

export function createConverter(config: File2MdConfig = {}): Converter {
  const registry = createParserRegistry();
  registerAllParsers(registry);

  const defaultCleaner = createMarkdownCleaner(config.defaultCleaner);
  const tmpDir = config.tmpDir ?? "/tmp/ventostack-file2md";
  const maxFileSize = config.maxFileSize ?? 100 * 1024 * 1024; // 100MB

  async function convertFile(
    buffer: Buffer,
    fileName: string,
    options: ConvertFileOptions = {},
  ): Promise<ConvertResult> {
    const startTime = Date.now();

    // 文件大小检查
    if (buffer.length > maxFileSize) {
      throw new Error(
        `文件大小 ${(buffer.length / 1024 / 1024).toFixed(1)}MB 超过限制 ${(maxFileSize / 1024 / 1024).toFixed(0)}MB`
      );
    }

    const emitter = createProgressEmitter(options.onProgress);

    emitter.emit("start", {
      fileName,
      message: `开始转换: ${fileName} (${(buffer.length / 1024).toFixed(1)}KB)`,
    });

    // 查找解析器
    const parser = registry.resolve(fileName);
    if (!parser) {
      throw new Error(`找不到能处理 "${fileName}" 的解析器`);
    }

    emitter.emit("parse_start", { fileName, message: `使用解析器: ${parser.name}` });

    // 构建解析上下文
    const fileTmpDir = join(tmpDir, `convert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await mkdir(fileTmpDir, { recursive: true });

    const ctx: ParseContext = {
      ocr: options.ocr ?? config.ocr,
      cleaner: options.cleaner ?? config.defaultCleaner,
      onProgress: options.onProgress,
      tmpDir: fileTmpDir,
      maxDepth: config.maxZipDepth ?? 3,
      currentDepth: 0,
      sourceDir: options.sourceDir,
    };

    // 执行解析
    let result: ConvertResult;
    try {
      result = await parser.parse({ buffer, fileName }, ctx);
    } finally {
      // 清理临时目录（不等待完成）
      const { rm } = await import("node:fs/promises");
      rm(fileTmpDir, { recursive: true, force: true }).catch(() => {});
    }

    // 保存源文件
    if (options.sourceDir) {
      await mkdir(options.sourceDir, { recursive: true });
      const safeName = fileName.replace(/[^\w._-]/g, "_");
      const sourcePath = join(options.sourceDir, safeName);
      await writeFile(sourcePath, buffer);
      result.sourcePath = safeName;
    }

    // Markdown 清洗
    const cleaner = options.cleaner?.enabled === false
      ? null
      : createMarkdownCleaner(options.cleaner ?? config.defaultCleaner);

    if (cleaner) {
      emitter.emit("clean_start", { fileName, message: "Markdown 清洗中..." });

      for (const output of result.outputs) {
        output.content = cleaner.clean(output.content, {
          fileName: output.relativePath,
          metadata: output.metadata ?? {},
        });
      }

      emitter.emit("clean_done", { fileName, message: "Markdown 清洗完成" });
    }

    result.duration = Date.now() - startTime;

    emitter.emit("complete", {
      fileName,
      message: `转换完成，耗时 ${result.duration}ms，输出 ${result.outputs.length} 个文件`,
      progress: { current: 1, total: 1 },
    });

    return result;
  }

  async function convertBatch(
    files: Array<{ buffer: Buffer; fileName: string }>,
    options: ConvertBatchOptions = {},
  ): Promise<ConvertResult[]> {
    const concurrency = options.concurrency ?? 3;
    const results: ConvertResult[] = [];
    const errors: Array<{ fileName: string; error: Error }> = [];

    const batchEmitter = createProgressEmitter(options.onBatchProgress);
    batchEmitter.emit("start", {
      fileName: "",
      message: `开始批量转换: ${files.length} 个文件，并发数 ${concurrency}`,
      progress: { current: 0, total: files.length },
    });

    // 简单并发控制
    let idx = 0;
    async function processNext(): Promise<void> {
      while (idx < files.length) {
        const currentIdx = idx++;
        const file = files[currentIdx]!;

        try {
          const result = await convertFile(file.buffer, file.fileName, {
            ...options,
            onProgress: (e) => {
              options.onProgress?.({ ...e, progress: { current: currentIdx + 1, total: files.length } });
            },
          });
          results.push(result);
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          errors.push({ fileName: file.fileName, error });
          options.onProgress?.({
            type: "error",
            fileName: file.fileName,
            message: error.message,
            error,
            progress: { current: currentIdx + 1, total: files.length },
          });
        }
      }
    }

    // 启动并发 workers
    const workers = Array.from({ length: Math.min(concurrency, files.length) }, () => processNext());
    await Promise.all(workers);

    batchEmitter.emit("complete", {
      fileName: "",
      message: `批量转换完成: ${results.length} 成功, ${errors.length} 失败`,
      progress: { current: files.length, total: files.length },
    });

    return results;
  }

  return {
    convertFile,
    convertBatch,
    getSupportedFormats: () => registry.getSupportedExtensions(),
    getRegistry: () => registry,
  };
}

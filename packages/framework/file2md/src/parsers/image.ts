/**
 * 图片解析器
 * 通过 OCR 识别图片中的文字，转换为 Markdown
 */
import { extname } from "node:path";
import type { FileParser, ParseInput, ParseContext, ConvertResult, MdOutput } from "../types";

const IMAGE_EXTENSIONS = [
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff", ".tif", ".ico",
];

export function createImageParser(): FileParser {
  return {
    name: "image",
    extensions: IMAGE_EXTENSIONS,

    canHandle(fileName: string): boolean {
      const ext = extname(fileName).toLowerCase();
      return IMAGE_EXTENSIONS.includes(ext);
    },

    async parse(input: ParseInput, ctx: ParseContext): Promise<ConvertResult> {
      const { buffer, fileName } = input;
      const ext = extname(fileName).replace(/^\./, "").toLowerCase();
      const baseName = fileName.replace(/\.[^.]+$/, "");

      if (!ctx.ocr) {
        throw new Error(
          `图片文件 "${fileName}" 需要 OCR 服务来识别文字，但未配置 OCR 服务。` +
          `\n请在 File2MdConfig 中配置 ocr 服务，或使用远程 OCR（如 PaddleOCR）。`
        );
      }

      ctx.onProgress?.({
        type: "ocr_start",
        fileName,
        message: "开始 OCR 识别...",
      });

      const startTime = Date.now();
      const ocrResult = await ctx.ocr.recognize(buffer, {
        language: ctx.cleaner?.ruleOptions?.ocrLanguage as string,
      });
      const ocrDuration = Date.now() - startTime;

      ctx.onProgress?.({
        type: "ocr_done",
        fileName,
        message: `OCR 完成，耗时 ${ocrDuration}ms，置信度 ${(ocrResult.confidence * 100).toFixed(1)}%`,
      });

      const warnings: string[] = [];
      if (ocrResult.confidence < 0.5) {
        warnings.push(`OCR 置信度较低 (${(ocrResult.confidence * 100).toFixed(1)}%)，结果可能不准确`);
      }

      const lines: string[] = [];
      lines.push(`# ${baseName}`);
      lines.push("");
      lines.push(`> 来源文件：\`${fileName}\`（图片 OCR 识别）`);
      lines.push(`> 置信度：${(ocrResult.confidence * 100).toFixed(1)}%`);
      if (ocrResult.language) {
        lines.push(`> 识别语言：${ocrResult.language}`);
      }
      lines.push("");
      lines.push("---");
      lines.push("");

      if (ocrResult.text.trim()) {
        lines.push(ocrResult.text.trim());
      } else {
        lines.push("> *图片中未识别到文字内容*");
        warnings.push("OCR 未识别到任何文字");
      }

      const output: MdOutput = {
        relativePath: `${baseName}.md`,
        content: lines.join("\n"),
        title: baseName,
        metadata: {
          ocrConfidence: ocrResult.confidence,
          ocrLanguage: ocrResult.language,
          ocrDuration,
          imageFormat: ext,
          imageSize: buffer.length,
          blockCount: ocrResult.blocks?.length ?? 0,
        },
      };

      return {
        sourceFileName: fileName,
        outputs: [output],
        parser: "image-ocr",
        duration: ocrDuration,
        warnings,
        metadata: {
          ocrConfidence: ocrResult.confidence,
          imageFormat: ext,
          imageSize: buffer.length,
        },
      };
    },
  };
}

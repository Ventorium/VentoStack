/**
 * PDF → Markdown 解析器
 *
 * 多策略解析：
 * 1. 尝试 @llamaindex/liteparse 原生文本提取
 * 2. 检测是否为扫描件（文本内容过少）
 * 3. 如果是扫描件且有 OCR 服务，使用 OCR fallback
 *
 * 每页独立 block，保留页码元数据。
 */
import type { FileParser, ParseInput, ParseContext, ConvertResult, MdOutput } from "../types";

export interface PdfParseOptions {
  /** 是否启用 OCR fallback（默认 true） */
  ocrEnabled?: boolean;
  /** OCR 语言 */
  ocrLanguage?: string;
  /** OCR 服务 URL（直接传入 liteparse 的 ocrServerUrl） */
  ocrServerUrl?: string;
}

export function createPdfParser(): FileParser {
  return {
    name: "pdf",
    extensions: [".pdf"],

    canHandle(fileName: string): boolean {
      return fileName.toLowerCase().endsWith(".pdf");
    },

    async parse(input: ParseInput, ctx: ParseContext): Promise<ConvertResult> {
      const { buffer, fileName } = input;
      const baseName = fileName.replace(/\.pdf$/i, "");
      const warnings: string[] = [];

      ctx.onProgress?.({
        type: "parse_start",
        fileName,
        message: "PDF 解析中...",
      });

      // ── 策略 1：@llamaindex/liteparse ──
      let parsedPages: Array<{ text: string; pageNum: number }> = [];
      let parseMethod = "liteparse";

      try {
        const { LiteParse } = await import("@llamaindex/liteparse");
        const lp = new LiteParse({
          ocrEnabled: ctx.ocr ? true : false,
          ocrLanguage: (ctx.cleaner?.ruleOptions?.ocrLanguage as string) ?? undefined,
          ocrServerUrl: (ctx.cleaner?.ruleOptions?.ocrServerUrl as string) ?? undefined,
          outputFormat: "text",
          quiet: true,
        });

        const result = await lp.parse(buffer);

        parsedPages = result.pages.map((page, i) => ({
          text: (page.text ?? "").trim(),
          pageNum: i + 1,
        }));

        // ── 策略 2：检测是否为扫描件 ──
        const totalPages = parsedPages.length;
        const emptyPages = parsedPages.filter((p) => p.text.length < 20).length;
        const isScanLike = totalPages > 0 && emptyPages / totalPages > 0.7;

        if (isScanLike && ctx.ocr) {
          ctx.onProgress?.({
            type: "parse_start",
            fileName,
            message: `检测到扫描件（${emptyPages}/${totalPages} 页文本过少），切换 OCR 模式...`,
          });

          warnings.push("检测到扫描件或纯图片 PDF，使用 OCR 模式");
          parseMethod = "ocr-fallback";

          // TODO: 需要 PDF→图片 的能力（如 pdf2pic 或 poppler-utils）
          // 目前保留 liteparse 结果，后续可增强
          warnings.push("PDF → 图片 → OCR 的完整流程需要额外工具支持（如 poppler-utils）");
        }
      } catch (err) {
        warnings.push(`liteparse 解析失败: ${err instanceof Error ? err.message : String(err)}`);
        parseMethod = "raw-fallback";
        parsedPages = [{ text: buffer.toString("utf-8"), pageNum: 1 }];
      }

      ctx.onProgress?.({
        type: "parse_done",
        fileName,
        message: `PDF 解析完成（${parseMethod}），共 ${parsedPages.length} 页`,
      });

      // ── 构建 Markdown ──
      const outputs: MdOutput[] = [];

      // 主文档
      const mainLines: string[] = [];
      mainLines.push(`# ${baseName}`);
      mainLines.push("");
      mainLines.push(`> 来源文件：\`${fileName}\`（共 ${parsedPages.length} 页，解析方式：${parseMethod}）`);
      mainLines.push("");
      mainLines.push("---");
      mainLines.push("");

      for (const page of parsedPages) {
        mainLines.push(`## 第 ${page.pageNum} 页`);
        mainLines.push("");

        if (page.text) {
          mainLines.push(page.text);
        } else {
          mainLines.push("> *（空白页或仅含图片）*");
          warnings.push(`第 ${page.pageNum} 页无文本内容`);
        }

        mainLines.push("");
        mainLines.push("---");
        mainLines.push("");
      }

      outputs.push({
        relativePath: `${baseName}.md`,
        content: mainLines.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
        title: baseName,
        metadata: {
          pageCount: parsedPages.length,
          parseMethod,
          emptyPages: parsedPages.filter((p) => !p.text).length,
        },
      });

      return {
        sourceFileName: fileName,
        outputs,
        parser: `pdf-${parseMethod}`,
        duration: 0,
        warnings,
        metadata: {
          pageCount: parsedPages.length,
          parseMethod,
        },
      };
    },
  };
}

/**
 * DOCX → Markdown 解析器
 *
 * DOCX = ZIP 内含 XML，直接解析。零外部依赖。
 * 增强版：提取图片→OCR、保留元数据（作者/创建时间/修改时间/页数）
 */
import type { FileParser, ParseInput, ParseContext, ConvertResult, MdOutput } from "../types";
import { readZipEntries } from "./zip-reader";

export function createDocxParser(): FileParser {
  return {
    name: "docx",
    extensions: [".docx"],

    canHandle(fileName: string): boolean {
      return fileName.toLowerCase().endsWith(".docx");
    },

    async parse(input: ParseInput, ctx: ParseContext): Promise<ConvertResult> {
      const { buffer, fileName } = input;
      const baseName = fileName.replace(/\.docx$/i, "");
      const warnings: string[] = [];

      const entries = readZipEntries(buffer);

      // ── 读取 document.xml（主文档）──
      const docEntry = entries.find((e) => e.name === "word/document.xml");
      if (!docEntry) {
        return {
          sourceFileName: fileName,
          outputs: [{
            relativePath: `${baseName}.md`,
            content: `# ${baseName}\n\n> 无法解析 DOCX：缺少 document.xml`,
            title: baseName,
          }],
          parser: "docx",
          duration: 0,
          warnings: ["Missing word/document.xml"],
          metadata: {},
        };
      }

      // ── 提取元数据 ──
      const metadata = extractDocxMetadata(entries);
      const baseTitle = metadata.title ?? baseName;

      // ── 提取图片 ──
      const imageOutputs: MdOutput[] = [];
      const imageEntries = entries.filter((e) =>
        e.name.startsWith("word/media/") && isImageFile(e.name)
      );

      if (imageEntries.length > 0 && ctx.ocr) {
        for (let i = 0; i < imageEntries.length; i++) {
          const imgEntry = imageEntries[i]!;
          try {
            ctx.onProgress?.({
              type: "ocr_start",
              fileName: imgEntry.name,
              message: `识别 DOCX 内嵌图片 ${i + 1}/${imageEntries.length}...`,
              progress: { current: i + 1, total: imageEntries.length },
            });

            const ocrResult = await ctx.ocr.recognize(imgEntry.data);
            if (ocrResult.text.trim()) {
              const imgName = imgEntry.name.split("/").pop() ?? `image-${i}`;
              imageOutputs.push({
                relativePath: `${baseName}_images/${imgName}.md`,
                content: [
                  `# ${baseTitle} - 图片: ${imgName}`,
                  "",
                  `> DOCX 内嵌图片 OCR 识别，置信度 ${(ocrResult.confidence * 100).toFixed(1)}%`,
                  "",
                  ocrResult.text.trim(),
                ].join("\n"),
                title: `${baseTitle} - ${imgName}`,
                metadata: { ocrConfidence: ocrResult.confidence },
              });
            }
          } catch (err) {
            warnings.push(
              `图片 ${imgEntry.name} OCR 失败: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      } else if (imageEntries.length > 0) {
        warnings.push(`DOCX 包含 ${imageEntries.length} 张图片，但未配置 OCR 服务，跳过图片识别`);
      }

      // ── 解析主文档 ──
      const xml = docEntry.data.toString("utf-8");
      const markdown = docxXmlToMarkdown(xml, baseTitle, metadata);

      const mainOutput: MdOutput = {
        relativePath: `${baseName}.md`,
        content: markdown,
        title: baseTitle,
        metadata: {
          ...metadata,
          imageCount: imageEntries.length,
          imagesProcessed: imageOutputs.length,
        },
      };

      return {
        sourceFileName: fileName,
        outputs: [mainOutput, ...imageOutputs],
        parser: "docx",
        duration: 0,
        warnings,
        metadata: { ...metadata, imageCount: imageEntries.length },
      };
    },
  };
}

/** DOCX 元数据 */
interface DocxMetadata {
  title?: string;
  author?: string;
  created?: string;
  modified?: string;
  lastModifiedBy?: string;
  pages?: number;
  words?: number;
  revision?: string;
}

/** 从 DOCX ZIP 提取元数据 */
function extractDocxMetadata(entries: Array<{ name: string; data: Buffer }>): DocxMetadata {
  const meta: DocxMetadata = {};

  // app.xml — 页数、字数
  const appEntry = entries.find((e) => e.name === "docProps/app.xml");
  if (appEntry) {
    const xml = appEntry.data.toString("utf-8");
    meta.pages = extractXmlValue(xml, "Pages");
    meta.words = extractXmlValue(xml, "Words");
  }

  // core.xml — 作者、日期
  const coreEntry = entries.find((e) => e.name === "docProps/core.xml");
  if (coreEntry) {
    const xml = coreEntry.data.toString("utf-8");
    meta.author = extractXmlText(xml, "dc:creator");
    meta.created = extractXmlText(xml, "dcterms:created");
    meta.modified = extractXmlText(xml, "dcterms:modified");
    meta.lastModifiedBy = extractXmlText(xml, "cp:lastModifiedBy");
    meta.revision = extractXmlText(xml, "cp:revision");
  }

  // custom.xml — 标题
  const customEntry = entries.find((e) => e.name === "docProps/custom.xml");
  if (!customEntry) {
    // 尝试从 core.xml 提取标题
    const coreXml = coreEntry?.data.toString("utf-8");
    if (coreXml) {
      meta.title = extractXmlText(coreXml, "dc:title") || undefined;
    }
  }

  return meta;
}

function extractXmlValue(xml: string, tagName: string): number | undefined {
  const match = xml.match(new RegExp(`<${tagName}>(\\d+)</${tagName}>`));
  return match?.[1] ? parseInt(match[1], 10) : undefined;
}

function extractXmlText(xml: string, tagName: string): string | undefined {
  const match = xml.match(new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`));
  return match?.[1]?.trim() || undefined;
}

/** 将 DOCX XML 转换为 Markdown */
function docxXmlToMarkdown(xml: string, fallbackTitle: string, metadata: DocxMetadata): string {
  const lines: string[] = [];

  // ── 头部元数据 ──
  lines.push(`# ${fallbackTitle}`);
  lines.push("");

  const metaParts: string[] = [];
  if (metadata.author) metaParts.push(`作者：${metadata.author}`);
  if (metadata.created) metaParts.push(`创建时间：${metadata.created}`);
  if (metadata.modified) metaParts.push(`修改时间：${metadata.modified}`);
  if (metadata.pages) metaParts.push(`页数：${metadata.pages}`);
  if (metadata.words) metaParts.push(`字数：${metadata.words}`);
  if (metadata.revision) metaParts.push(`修订版本：${metadata.revision}`);

  if (metaParts.length > 0) {
    lines.push(`> ${metaParts.join(" | ")}`);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  // ── 段落提取 ──
  const paraRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  let paraMatch: RegExpExecArray | null;

  while ((paraMatch = paraRegex.exec(xml)) !== null) {
    const paraXml = paraMatch[1]!;

    // 段落样式
    const styleMatch = paraXml.match(/<w:pStyle\b[^>]*w:val="([^"]*)"/);
    const style = styleMatch?.[1] ?? "";

    // 提取文本
    const textParts: string[] = [];
    const textRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let textMatch: RegExpExecArray | null;
    while ((textMatch = textRegex.exec(paraXml)) !== null) {
      textParts.push(textMatch[1]!);
    }
    const text = textParts.join("").trim();
    if (!text) continue;

    // 内联样式
    const isBold = /<w:b\b/.test(paraXml);
    const isItalic = /<w:i\b/.test(paraXml);

    // 样式映射
    if (style.startsWith("Heading1") || style === "Title") {
      lines.push(`## ${text}`);
    } else if (style.startsWith("Heading2") || style === "Subtitle") {
      lines.push(`### ${text}`);
    } else if (style.startsWith("Heading3")) {
      lines.push(`#### ${text}`);
    } else if (style.startsWith("Heading4")) {
      lines.push(`##### ${text}`);
    } else if (style.startsWith("List")) {
      lines.push(`- ${formatInline(text, isBold, isItalic)}`);
    } else {
      lines.push(formatInline(text, isBold, isItalic));
    }
    lines.push("");
  }

  // ── 表格提取 ──
  const tableRegex = /<w:tbl\b[^>]*>([\s\S]*?)<\/w:tbl>/g;
  let tableMatch: RegExpExecArray | null;
  while ((tableMatch = tableRegex.exec(xml)) !== null) {
    lines.push("");
    const rowRegex = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g;
    let rowMatch: RegExpExecArray | null;
    let isFirstRow = true;
    while ((rowMatch = rowRegex.exec(tableMatch[1]!)) !== null) {
      const cellRegex = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g;
      const cells: string[] = [];
      let cellMatch: RegExpExecArray | null;
      while ((cellMatch = cellRegex.exec(rowMatch[1]!)) !== null) {
        const cellTexts: string[] = [];
        const cellTextRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
        let ct: RegExpExecArray | null;
        while ((ct = cellTextRegex.exec(cellMatch[1]!)) !== null) {
          cellTexts.push(ct[1]!);
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

function isImageFile(name: string): boolean {
  const lower = name.toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|tiff?)$/.test(lower);
}

/**
 * PPTX → Markdown 解析器
 *
 * PPTX = ZIP 内含 XML。
 * 每页 slide → 独立 md block，保留 speaker notes、图片→OCR。
 */
import type { FileParser, ParseInput, ParseContext, ConvertResult, MdOutput } from "../types";
import { readZipEntries } from "./zip-reader";

export function createPptxParser(): FileParser {
  return {
    name: "pptx",
    extensions: [".pptx"],

    canHandle(fileName: string): boolean {
      return fileName.toLowerCase().endsWith(".pptx");
    },

    async parse(input: ParseInput, ctx: ParseContext): Promise<ConvertResult> {
      const { buffer, fileName } = input;
      const baseName = fileName.replace(/\.pptx$/i, "");
      const warnings: string[] = [];

      const entries = readZipEntries(buffer);

      // ── 元数据 ──
      const metadata = extractPptxMetadata(entries);
      const baseTitle = metadata.title ?? baseName;

      // ── 收集幻灯片 ──
      const slideEntries = entries
        .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.name))
        .sort((a, b) => {
          const numA = parseInt(a.name.match(/slide(\d+)/)?.[1] ?? "0");
          const numB = parseInt(b.name.match(/slide(\d+)/)?.[1] ?? "0");
          return numA - numB;
        });

      if (slideEntries.length === 0) {
        return {
          sourceFileName: fileName,
          outputs: [{
            relativePath: `${baseName}.md`,
            content: `# ${baseTitle}\n\n> 无法解析 PPTX：无幻灯片内容`,
            title: baseTitle,
          }],
          parser: "pptx",
          duration: 0,
          warnings: ["No slides found"],
          metadata,
        };
      }

      // ── 收集 notes（演讲者备注）──
      const notesMap = new Map<string, string>();
      entries
        .filter((e) => /^ppt\/notes\/notesSlide\d+\.xml$/.test(e.name))
        .forEach((e) => {
          const num = e.name.match(/notesSlide(\d+)/)?.[1];
          if (num) {
            notesMap.set(num, extractTextFromXml(e.data.toString("utf-8")));
          }
        });

      // ── 收集 slide 内的图片引用 → 实际图片 ──
      const imageMap = new Map<string, Buffer>();
      entries
        .filter((e) => /^ppt\/media\//.test(e.name))
        .forEach((e) => {
          imageMap.set(e.name, e.data);
        });

      // ── 逐页解析 ──
      const outputs: MdOutput[] = [];

      // 主文档
      const mainLines: string[] = [];
      mainLines.push(`# ${baseTitle}`);
      mainLines.push("");

      const metaParts: string[] = [];
      if (metadata.author) metaParts.push(`作者：${metadata.author}`);
      if (metadata.created) metaParts.push(`创建时间：${metadata.created}`);
      if (metadata.modified) metaParts.push(`修改时间：${metadata.modified}`);
      metaParts.push(`幻灯片数：${slideEntries.length}`);

      if (metaParts.length > 0) {
        mainLines.push(`> ${metaParts.join(" | ")}`);
        mainLines.push("");
        mainLines.push("---");
        mainLines.push("");
      }

      for (let i = 0; i < slideEntries.length; i++) {
        const slideEntry = slideEntries[i]!;
        const slideNum = slideEntry.name.match(/slide(\d+)/)?.[1] ?? String(i + 1);
        const slideXml = slideEntry.data.toString("utf-8");
        const slideText = extractTextFromXml(slideXml);

        mainLines.push(`## 第 ${slideNum} 页`);
        mainLines.push("");

        if (slideText.trim()) {
          mainLines.push(slideText.trim());
        } else {
          mainLines.push("> *（空白页或仅含图形）*");
        }

        // 演讲者备注
        const notes = notesMap.get(slideNum);
        if (notes?.trim()) {
          mainLines.push("");
          mainLines.push(`> **演讲者备注：** ${notes.trim()}`);
        }

        mainLines.push("");
        mainLines.push("---");
        mainLines.push("");
      }

      outputs.push({
        relativePath: `${baseName}.md`,
        content: mainLines.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
        title: baseTitle,
        metadata: { ...metadata, slideCount: slideEntries.length },
      });

      // ── 图片 OCR ──
      if (imageMap.size > 0 && ctx.ocr) {
        let processed = 0;
        for (const [imgPath, imgBuffer] of imageMap) {
          if (!isImageFile(imgPath)) continue;
          processed++;
          const imgName = imgPath.split("/").pop() ?? `image-${processed}`;
          try {
            ctx.onProgress?.({
              type: "ocr_start",
              fileName: imgPath,
              message: `识别 PPTX 图片 ${processed}/${imageMap.size}...`,
              progress: { current: processed, total: imageMap.size },
            });

            const ocrResult = await ctx.ocr.recognize(imgBuffer);
            if (ocrResult.text.trim()) {
              outputs.push({
                relativePath: `${baseName}_images/${imgName}.md`,
                content: [
                  `# ${baseTitle} - 图片: ${imgName}`,
                  "",
                  `> PPTX 内嵌图片 OCR 识别，置信度 ${(ocrResult.confidence * 100).toFixed(1)}%`,
                  "",
                  ocrResult.text.trim(),
                ].join("\n"),
                title: `${baseTitle} - ${imgName}`,
                metadata: { ocrConfidence: ocrResult.confidence },
              });
            }
          } catch (err) {
            warnings.push(`图片 ${imgName} OCR 失败: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } else if (imageMap.size > 0) {
        warnings.push(`PPTX 包含 ${imageMap.size} 张图片，但未配置 OCR 服务`);
      }

      return {
        sourceFileName: fileName,
        outputs,
        parser: "pptx",
        duration: 0,
        warnings,
        metadata: { ...metadata, slideCount: slideEntries.length, imageCount: imageMap.size },
      };
    },
  };
}

interface PptxMetadata {
  title?: string;
  author?: string;
  created?: string;
  modified?: string;
  lastModifiedBy?: string;
  slideCount?: number;
}

function extractPptxMetadata(entries: Array<{ name: string; data: Buffer }>): PptxMetadata {
  const meta: PptxMetadata = {};

  const coreEntry = entries.find((e) => e.name === "docProps/core.xml");
  if (coreEntry) {
    const xml = coreEntry.data.toString("utf-8");
    meta.author = extractXmlText(xml, "dc:creator");
    meta.created = extractXmlText(xml, "dcterms:created");
    meta.modified = extractXmlText(xml, "dcterms:modified");
    meta.lastModifiedBy = extractXmlText(xml, "cp:lastModifiedBy");
    meta.title = extractXmlText(xml, "dc:title") || undefined;
  }

  return meta;
}

function extractXmlText(xml: string, tagName: string): string | undefined {
  const match = xml.match(new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`));
  return match?.[1]?.trim() || undefined;
}

/** 从 XML 中提取所有文本内容 */
function extractTextFromXml(xml: string): string {
  const texts: string[] = [];
  // <a:t>text</a:t>
  const regex = /<a:t>([^<]*)<\/a:t>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    if (match[1]?.trim()) {
      texts.push(match[1]!);
    }
  }
  return texts.join(" ");
}

function isImageFile(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(name);
}

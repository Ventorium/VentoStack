/**
 * XLSX → Markdown 解析器
 *
 * XLSX = ZIP 内含 XML。
 * 每个 sheet → 独立 md block，保留 sheet 名称和元数据。
 * 零外部依赖，自研 XML 解析。
 */
import type { FileParser, ParseInput, ParseContext, ConvertResult, MdOutput } from "../types";
import { readZipEntries } from "./zip-reader";

export function createXlsxParser(): FileParser {
  return {
    name: "xlsx",
    extensions: [".xlsx"],

    canHandle(fileName: string): boolean {
      return fileName.toLowerCase().endsWith(".xlsx");
    },

    async parse(input: ParseInput, ctx: ParseContext): Promise<ConvertResult> {
      const { buffer, fileName } = input;
      const baseName = fileName.replace(/\.xlsx$/i, "");
      const warnings: string[] = [];

      const entries = readZipEntries(buffer);

      // ── 元数据 ──
      const metadata = extractXlsxMetadata(entries);
      const baseTitle = metadata.title ?? baseName;

      // ── 共享字符串表 ──
      const sharedStrings = parseSharedStrings(entries);

      // ── 工作表列表 ──
      const workbookXml = entries.find((e) => e.name === "xl/workbook.xml");
      if (!workbookXml) {
        return {
          sourceFileName: fileName,
          outputs: [{
            relativePath: `${baseName}.md`,
            content: `# ${baseTitle}\n\n> 无法解析 XLSX：缺少 workbook.xml`,
            title: baseTitle,
          }],
          parser: "xlsx",
          duration: 0,
          warnings: ["Missing xl/workbook.xml"],
          metadata,
        };
      }

      const sheetInfos = parseWorkbookSheets(workbookXml.data.toString("utf-8"));
      const outputs: MdOutput[] = [];

      // 主文档索引
      const indexLines: string[] = [];
      indexLines.push(`# ${baseTitle}`);
      indexLines.push("");

      const metaParts: string[] = [];
      if (metadata.author) metaParts.push(`作者：${metadata.author}`);
      if (metadata.created) metaParts.push(`创建时间：${metadata.created}`);
      if (metadata.modified) metaParts.push(`修改时间：${metadata.modified}`);
      metaParts.push(`工作表数：${sheetInfos.length}`);

      if (metaParts.length > 0) {
        indexLines.push(`> ${metaParts.join(" | ")}`);
        indexLines.push("");
      }

      // ── 逐 sheet 解析 ──
      for (const sheet of sheetInfos) {
        const sheetFile = entries.find((e) => e.name === `xl/worksheets/sheet${sheet.id}.xml`);
        if (!sheetFile) {
          warnings.push(`工作表 "${sheet.name}"（sheet${sheet.id}.xml）未找到`);
          continue;
        }

        const sheetXml = sheetFile.data.toString("utf-8");
        const rows = parseSheetData(sheetXml, sharedStrings);

        if (rows.length === 0) {
          indexLines.push(`## sheet:${sheet.name}`);
          indexLines.push("");
          indexLines.push("> *（空工作表）*");
          indexLines.push("");
          continue;
        }

        // 构建表格 md
        const tableLines: string[] = [];
        tableLines.push(`## sheet:${sheet.name}`);
        tableLines.push("");
        tableLines.push(`> 行数：${rows.length}`);
        tableLines.push("");

        // 表头（第一行）
        const header = rows[0]!;
        tableLines.push(`| ${header.join(" | ")} |`);
        tableLines.push(`| ${header.map(() => "---").join(" | ")} |`);

        // 数据行
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r]!;
          // 确保列数与表头一致
          while (row.length < header.length) row.push("");
          tableLines.push(`| ${row.slice(0, header.length).join(" | ")} |`);
        }
        tableLines.push("");

        // 同时写入主文档和独立文件
        indexLines.push(tableLines.join("\n"));
        indexLines.push("---");
        indexLines.push("");

        outputs.push({
          relativePath: `${baseName}/${sheet.name}.md`,
          content: [
            `# ${baseTitle} - ${sheet.name}`,
            "",
            `> 来源文件：\`${fileName}\` | 工作表：${sheet.name} | 行数：${rows.length}`,
            "",
            tableLines.join("\n"),
          ].join("\n"),
          title: `${baseTitle} - ${sheet.name}`,
          metadata: { sheetName: sheet.name, sheetId: sheet.id, rowCount: rows.length },
        });
      }

      // 主文档也作为输出
      outputs.unshift({
        relativePath: `${baseName}.md`,
        content: indexLines.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
        title: baseTitle,
        metadata: { ...metadata, sheetCount: sheetInfos.length },
      });

      return {
        sourceFileName: fileName,
        outputs,
        parser: "xlsx",
        duration: 0,
        warnings,
        metadata: { ...metadata, sheetCount: sheetInfos.length },
      };
    },
  };
}

// ── 解析辅助函数 ──

interface XlsxMetadata {
  title?: string;
  author?: string;
  created?: string;
  modified?: string;
  lastModifiedBy?: string;
}

interface SheetInfo {
  id: number;
  name: string;
}

function extractXlsxMetadata(entries: Array<{ name: string; data: Buffer }>): XlsxMetadata {
  const meta: XlsxMetadata = {};

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

function parseSharedStrings(entries: Array<{ name: string; data: Buffer }>): string[] {
  const ssEntry = entries.find((e) => e.name === "xl/sharedStrings.xml");
  if (!ssEntry) return [];

  const xml = ssEntry.data.toString("utf-8");
  const strings: string[] = [];
  // <si><t>text</t></si> 或 <si><r><t>text</t></r></si>
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let siMatch: RegExpExecArray | null;
  while ((siMatch = siRegex.exec(xml)) !== null) {
    const tRegex = /<t[^>]*>([^<]*)<\/t>/g;
    const parts: string[] = [];
    let tMatch: RegExpExecArray | null;
    while ((tMatch = tRegex.exec(siMatch[1]!)) !== null) {
      parts.push(tMatch[1]!);
    }
    strings.push(parts.join(""));
  }
  return strings;
}

function parseWorkbookSheets(xml: string): SheetInfo[] {
  const sheets: SheetInfo[] = [];
  const regex = /<sheet\b[^>]*name="([^"]*)"[^>]*r:id="([^"]*)"[^>]*\/>/g;
  let match: RegExpExecArray | null;
  let idx = 1;
  while ((match = regex.exec(xml)) !== null) {
    sheets.push({ id: idx++, name: match[1]! });
  }
  return sheets;
}

function parseSheetData(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];

  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(xml)) !== null) {
    const cells: string[] = [];
    const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRegex.exec(rowMatch[1]!)) !== null) {
      const attrs = cellMatch[1]!;
      const valueXml = cellMatch[2]!;

      // 检查类型：t="s" 表示共享字符串
      const typeMatch = attrs.match(/\bt="([^"]*)"/);
      const type = typeMatch?.[1];

      // 提取值
      const vMatch = valueXml.match(/<v>([^<]*)<\/v>/);
      const v = vMatch?.[1] ?? "";

      if (type === "s") {
        // 共享字符串索引
        const idx = parseInt(v, 10);
        cells.push(sharedStrings[idx] ?? "");
      } else if (type === "inlineStr") {
        // 内联字符串
        const tMatch = valueXml.match(/<t[^>]*>([^<]*)<\/t>/);
        cells.push(tMatch?.[1] ?? "");
      } else {
        // 数值或其他
        cells.push(v);
      }
    }

    if (cells.some((c) => c.trim() !== "")) {
      rows.push(cells);
    }
  }

  return rows;
}

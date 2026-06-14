/**
 * 测试辅助：构建 ZIP / DOCX / PPTX / XLSX / EPUB 文件 Buffer
 */
import { deflateRawSync } from "node:zlib";

export interface ZipEntryInput {
  name: string;
  data: Buffer | string;
}

export function buildZip(entries: ZipEntryInput[]): Buffer {
  const parts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, "utf-8");
    const rawData = typeof entry.data === "string" ? Buffer.from(entry.data, "utf-8") : entry.data;
    const compressed = deflateRawSync(rawData);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt32LE(crc32(rawData), 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(rawData.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    parts.push(localHeader, nameBuffer, compressed);

    const ce = Buffer.alloc(46);
    ce.writeUInt32LE(0x02014b50, 0);
    ce.writeUInt16LE(20, 4);
    ce.writeUInt16LE(20, 6);
    ce.writeUInt16LE(8, 10);
    ce.writeUInt32LE(crc32(rawData), 16);
    ce.writeUInt32LE(compressed.length, 20);
    ce.writeUInt32LE(rawData.length, 24);
    ce.writeUInt16LE(nameBuffer.length, 28);
    ce.writeUInt32LE(offset, 42);
    centralParts.push(ce, nameBuffer);
    offset += localHeader.length + nameBuffer.length + compressed.length;
  }

  const cdOff = offset;
  const cdSize = centralParts.reduce((s, b) => s + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOff, 16);
  return Buffer.concat([...parts, ...centralParts, eocd]);
}

export function buildDocxZip(documentXml: string, extra?: ZipEntryInput[]): Buffer {
  return buildZip([
    { name: "word/document.xml", data: documentXml },
    { name: "docProps/core.xml", data: CORE_XML },
    { name: "docProps/app.xml", data: APP_XML },
    ...(extra ?? []),
  ]);
}

export function buildPptxZip(slides: Array<{ content: string; notes?: string }>): Buffer {
  const entries: ZipEntryInput[] = [{ name: "docProps/core.xml", data: CORE_XML }];
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i]!;
    const tx = s.content.split("\n").map(t => `<a:p><a:r><a:t>${esc(t)}</a:t></a:r></a:p>`).join("");
    entries.push({ name: `ppt/slides/slide${i + 1}.xml`, data: `<?xml version="1.0"?>${tx}` });
    if (s.notes) {
      const nx = s.notes.split("\n").map(t => `<a:p><a:r><a:t>${esc(t)}</a:t></a:r></a:p>`).join("");
      entries.push({ name: `ppt/notes/notesSlide${i + 1}.xml`, data: `<?xml version="1.0"?>${nx}` });
    }
  }
  return buildZip(entries);
}

export function buildXlsxZip(sheets: Array<{ name: string; rows: string[][] }>): Buffer {
  const entries: ZipEntryInput[] = [
    { name: "docProps/core.xml", data: CORE_XML },
    { name: "xl/workbook.xml", data: workbookXml(sheets) },
    { name: "xl/sharedStrings.xml", data: sharedStringsXml(sheets) },
  ];
  for (let i = 0; i < sheets.length; i++) {
    entries.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(sheets[i]!) });
  }
  return buildZip(entries);
}

export function buildEpubZip(chapters: Array<{ title: string; body: string }>): Buffer {
  const manifest = chapters.map((_, i) =>
    `<item id="ch${i}" href="ch${i}.xhtml" media-type="application/xhtml+xml"/>`
  ).join("");
  const spine = chapters.map((_, i) => `<itemref idref="ch${i}"/>`).join("");
  const opf = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Test Book</dc:title>
    <dc:language>en</dc:language>
    <dc:creator>Test Author</dc:creator>
  </metadata>
  <manifest>${manifest}</manifest>
  <spine>${spine}</spine>
</package>`;

  const entries: ZipEntryInput[] = [
    { name: "META-INF/container.xml", data: `<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf"/></rootfiles></container>` },
    { name: "content.opf", data: opf },
  ];
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i]!;
    entries.push({
      name: `ch${i}.xhtml`,
      data: `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${esc(ch.title)}</title></head><body><h1>${esc(ch.title)}</h1><p>${esc(ch.body)}</p></body></html>`,
    });
  }
  return buildZip(entries);
}

// ── helpers ──

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const CORE_XML = `<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"><dc:creator>Test Author</dc:creator><dcterms:created>2024-01-01T00:00:00Z</dcterms:created><dcterms:modified>2024-06-01T00:00:00Z</dcterms:modified></cp:coreProperties>`;
const APP_XML = `<?xml version="1.0"?><Properties><Pages>5</Pages><Words>1000</Words></Properties>`;

function workbookXml(sheets: Array<{ name: string }>): string {
  const se = sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("");
  return `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${se}</sheets></workbook>`;
}

function sharedStringsXml(_sheets: Array<{ rows: string[][] }>): string {
  // Minimal empty shared strings
  return `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0" uniqueCount="0"/>`;
}

function sheetXml(sheet: { rows: string[][] }): string {
  const rows = sheet.rows.map((row, ri) => {
    const cells = row.map((cell, ci) => {
      const ref = `${String.fromCharCode(65 + ci)}${ri + 1}`;
      if (cell !== "" && !isNaN(Number(cell))) {
        return `<c r="${ref}"><v>${cell}</v></c>`;
      }
      return `<c r="${ref}" t="inlineStr"><is><t>${esc(cell)}</t></is></c>`;
    }).join("");
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]!;
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

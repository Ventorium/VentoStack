import { describe, test, expect } from "bun:test";
import { createDocxParser } from "../../parsers/docx";
import type { ParseContext } from "../../types";

const ctx: ParseContext = { tmpDir: "/tmp/test" };

describe("docx parser", () => {
  const parser = createDocxParser();

  test("supports .docx extension", () => {
    expect(parser.canHandle("report.docx")).toBe(true);
    expect(parser.canHandle("DOCX.docx")).toBe(true);
    expect(parser.canHandle("file.doc")).toBe(false);
    expect(parser.canHandle("file.pdf")).toBe(false);
  });

  test("handles missing document.xml gracefully", async () => {
    // 空 ZIP
    const { readZipEntries } = await import("../../parsers/zip-reader");
    // Create a minimal valid ZIP (empty)
    const { deflateRawSync } = await import("node:zlib");

    // Build a minimal ZIP with no entries
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 8);   // num entries on disk
    eocd.writeUInt16LE(0, 10);  // total entries
    eocd.writeUInt32LE(0, 12);  // central dir size
    eocd.writeUInt32LE(0, 16);  // central dir offset

    const result = await parser.parse({ buffer: eocd, fileName: "empty.docx" }, ctx);
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]!.content).toContain("无法解析");
  });

  test("converts simple docx XML to markdown", async () => {
    // Build a minimal DOCX ZIP with word/document.xml
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Title Here</w:t></w:r></w:p>
    <w:p><w:r><w:t>Body paragraph text.</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Subtitle</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Bold text</w:t></w:r></w:p>
  </w:body>
</w:document>`;

    // Create proper DOCX ZIP
    const zipBuffer = createDocxZip(documentXml);
    const result = await parser.parse({ buffer: zipBuffer, fileName: "test.docx" }, ctx);

    expect(result.parser).toBe("docx");
    expect(result.outputs).toHaveLength(1);
    const md = result.outputs[0]!.content;
    expect(md).toContain("# test");
    expect(md).toContain("## Title Here");
    expect(md).toContain("Body paragraph text.");
    expect(md).toContain("### Subtitle");
    expect(md).toContain("**Bold text**");
  });
});

/**
 * 创建最小 DOCX ZIP 文件
 */
function createDocxZip(documentXml: string): Buffer {
  const { deflateRawSync } = require("node:zlib");
  const entries: Array<{ name: string; data: Buffer }> = [
    { name: "word/document.xml", data: Buffer.from(documentXml) },
    { name: "docProps/core.xml", data: Buffer.from('<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Test</dc:creator></cp:coreProperties>') },
  ];
  return buildZip(entries);
}

function buildZip(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const { deflateRawSync } = require("node:zlib");
  const parts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, "utf-8");
    const compressed = deflateRawSync(entry.data);

    // Local file header
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);     // version needed
    localHeader.writeUInt16LE(0, 6);      // flags
    localHeader.writeUInt16LE(8, 8);      // compression method (deflate)
    localHeader.writeUInt16LE(0, 10);     // mod time
    localHeader.writeUInt16LE(0, 12);     // mod date
    localHeader.writeUInt32LE(crc32(entry.data), 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);     // extra length

    parts.push(localHeader, nameBuffer, compressed);

    // Central directory entry
    const centralEntry = Buffer.alloc(46);
    centralEntry.writeUInt32LE(0x02014b50, 0);
    centralEntry.writeUInt16LE(20, 4);     // version made by
    centralEntry.writeUInt16LE(20, 6);     // version needed
    centralEntry.writeUInt16LE(0, 8);      // flags
    centralEntry.writeUInt16LE(8, 10);     // compression method
    centralEntry.writeUInt16LE(0, 12);     // mod time
    centralEntry.writeUInt16LE(0, 14);     // mod date
    centralEntry.writeUInt32LE(crc32(entry.data), 16);
    centralEntry.writeUInt32LE(compressed.length, 20);
    centralEntry.writeUInt32LE(entry.data.length, 24);
    centralEntry.writeUInt16LE(nameBuffer.length, 28);
    centralEntry.writeUInt16LE(0, 30);     // extra length
    centralEntry.writeUInt16LE(0, 32);     // comment length
    centralEntry.writeUInt16LE(0, 34);     // disk number
    centralEntry.writeUInt16LE(0, 36);     // internal attributes
    centralEntry.writeUInt32LE(0, 38);     // external attributes
    centralEntry.writeUInt32LE(offset, 42); // local header offset

    centralParts.push(centralEntry, nameBuffer);
    offset += localHeader.length + nameBuffer.length + compressed.length;
  }

  const centralDirOffset = offset;
  const centralDirSize = centralParts.reduce((s, b) => s + b.length, 0);

  // EOCD
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);              // disk number
  eocd.writeUInt16LE(0, 6);              // disk with central dir
  eocd.writeUInt16LE(entries.length, 8);  // entries on disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);

  return Buffer.concat([...parts, ...centralParts, eocd]);
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]!;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

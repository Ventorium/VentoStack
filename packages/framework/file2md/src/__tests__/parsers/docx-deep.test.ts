import { describe, test, expect } from "bun:test";
import { createDocxParser } from "../../parsers/docx";
import { buildDocxZip, buildZip } from "../helpers/zip-builder";
import type { ParseContext, OCRService } from "../../types";

const ctx: ParseContext = { tmpDir: "/tmp/test" };

describe("docx parser — deep tests", () => {
  const parser = createDocxParser();

  test("extracts metadata from core.xml and app.xml", async () => {
    const zip = buildDocxZip(
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>'
    );
    const result = await parser.parse({ buffer: zip, fileName: "meta.docx" }, ctx);

    expect(result.metadata.author).toBe("Test Author");
    expect(result.metadata.created).toBeTruthy();
    expect(result.metadata.modified).toBeTruthy();
    expect(result.metadata.pages).toBe(5);
    expect(result.metadata.words).toBe(1000);
  });

  test("renders heading styles correctly", async () => {
    const xml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
      <w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Doc Title</w:t></w:r></w:p>
      <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Section 1</w:t></w:r></w:p>
      <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Subsection</w:t></w:r></w:p>
      <w:p><w:pPr><w:pStyle w:val="Heading3"/></w:pPr><w:r><w:t>Detail</w:t></w:r></w:p>
      <w:p><w:pPr><w:pStyle w:val="Heading4"/></w:pPr><w:r><w:t>Deep</w:t></w:r></w:p>
    </w:body></w:document>`;
    const zip = buildDocxZip(xml);
    const result = await parser.parse({ buffer: zip, fileName: "headings.docx" }, ctx);
    const md = result.outputs[0]!.content;
    expect(md).toContain("## Doc Title");     // Title maps to h2 (h1 is reserved for doc title)
    expect(md).toContain("## Section 1");     // Heading1 → h2
    expect(md).toContain("### Subsection");   // Heading2 → h3
    expect(md).toContain("#### Detail");      // Heading3 → h4
    expect(md).toContain("##### Deep");       // Heading4 → h5
  });

  test("renders bold and italic inline formatting", async () => {
    const xml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
      <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Bold text</w:t></w:r></w:p>
      <w:p><w:r><w:rPr><w:i/></w:rPr><w:t>Italic text</w:t></w:r></w:p>
      <w:p><w:r><w:rPr><w:b/><w:i/></w:rPr><w:t>Bold and italic</w:t></w:r></w:p>
    </w:body></w:document>`;
    const zip = buildDocxZip(xml);
    const result = await parser.parse({ buffer: zip, fileName: "format.docx" }, ctx);
    const md = result.outputs[0]!.content;
    expect(md).toContain("**Bold text**");
    expect(md).toContain("*Italic text*");
    expect(md).toContain("***Bold and italic***");
  });

  test("renders tables from docx XML", async () => {
    const xml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
      <w:tbl>
        <w:tr><w:tc><w:r><w:t>Name</w:t></w:r></w:tc><w:tc><w:r><w:t>Age</w:t></w:r></w:tc></w:tr>
        <w:tr><w:tc><w:r><w:t>Alice</w:t></w:r></w:tc><w:tc><w:r><w:t>30</w:t></w:r></w:tc></w:tr>
      </w:tbl>
    </w:body></w:document>`;
    const zip = buildDocxZip(xml);
    const result = await parser.parse({ buffer: zip, fileName: "table.docx" }, ctx);
    const md = result.outputs[0]!.content;
    expect(md).toContain("| Name | Age |");
    expect(md).toContain("| --- | --- |");
    expect(md).toContain("| Alice | 30 |");
  });

  test("renders list items", async () => {
    const xml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
      <w:p><w:pPr><w:pStyle w:val="ListBullet"/></w:pPr><w:r><w:t>Item A</w:t></w:r></w:p>
      <w:p><w:pPr><w:pStyle w:val="ListBullet"/></w:pPr><w:r><w:t>Item B</w:t></w:r></w:p>
    </w:body></w:document>`;
    const zip = buildDocxZip(xml);
    const result = await parser.parse({ buffer: zip, fileName: "list.docx" }, ctx);
    const md = result.outputs[0]!.content;
    expect(md).toContain("- Item A");
    expect(md).toContain("- Item B");
  });

  test("concatenates multiple text runs in a paragraph", async () => {
    const xml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
      <w:p><w:r><w:t>Hello </w:t></w:r><w:r><w:t>World</w:t></w:r></w:p>
    </w:body></w:document>`;
    const zip = buildDocxZip(xml);
    const result = await parser.parse({ buffer: zip, fileName: "runs.docx" }, ctx);
    expect(result.outputs[0]!.content).toContain("Hello World");
  });

  test("skips empty paragraphs", async () => {
    const xml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
      <w:p><w:r><w:t>Before</w:t></w:r></w:p>
      <w:p><w:r><w:t></w:t></w:r></w:p>
      <w:p><w:r><w:t>After</w:t></w:r></w:p>
    </w:body></w:document>`;
    const zip = buildDocxZip(xml);
    const result = await parser.parse({ buffer: zip, fileName: "empty-para.docx" }, ctx);
    const md = result.outputs[0]!.content;
    expect(md).toContain("Before");
    expect(md).toContain("After");
  });

  test("warns when images present but no OCR service", async () => {
    const zip = buildDocxZip(
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Text</w:t></w:r></w:p></w:body></w:document>',
      [{ name: "word/media/image1.png", data: Buffer.from("fake-png") }],
    );
    const result = await parser.parse({ buffer: zip, fileName: "with-img.docx" }, ctx);
    expect(result.warnings.some(w => w.includes("OCR") || w.includes("图片"))).toBe(true);
  });

  test("extracts images with OCR", async () => {
    const mockOCR: OCRService = {
      name: "mock",
      async recognize() {
        return { text: "Extracted from image", confidence: 0.85 };
      },
    };
    const zip = buildDocxZip(
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Main</w:t></w:r></w:p></w:body></w:document>',
      [{ name: "word/media/image1.png", data: Buffer.from("fake-png") }],
    );
    const result = await parser.parse(
      { buffer: zip, fileName: "ocr.docx" },
      { ...ctx, ocr: mockOCR },
    );
    expect(result.outputs.length).toBeGreaterThan(1);
    const imgOutput = result.outputs.find(o => o.relativePath.includes("image1"));
    expect(imgOutput).toBeTruthy();
    expect(imgOutput!.content).toContain("Extracted from image");
  });
});

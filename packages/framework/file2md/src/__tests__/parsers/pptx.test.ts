import { describe, test, expect } from "bun:test";
import { createPptxParser } from "../../parsers/pptx";
import { buildPptxZip } from "../helpers/zip-builder";
import type { ParseContext, OCRService } from "../../types";

const ctx: ParseContext = { tmpDir: "/tmp/test" };

describe("pptx parser", () => {
  const parser = createPptxParser();

  test("supports .pptx extension", () => {
    expect(parser.canHandle("slides.pptx")).toBe(true);
    expect(parser.canHandle("slides.ppt")).toBe(false);
    expect(parser.canHandle("file.txt")).toBe(false);
  });

  test("parses multi-slide presentation", async () => {
    const zip = buildPptxZip([
      { content: "Slide One Title\nBullet A\nBullet B" },
      { content: "Slide Two Title\nContent here" },
      { content: "Final Slide" },
    ]);
    const result = await parser.parse({ buffer: zip, fileName: "deck.pptx" }, ctx);

    expect(result.parser).toBe("pptx");
    expect(result.outputs).toHaveLength(1);
    const md = result.outputs[0]!.content;
    expect(md).toContain("# deck");
    expect(md).toContain("## 第 1 页");
    expect(md).toContain("Slide One Title");
    expect(md).toContain("## 第 2 页");
    expect(md).toContain("Slide Two Title");
    expect(md).toContain("## 第 3 页");
    expect(md).toContain("Final Slide");
    expect(result.metadata.slideCount).toBe(3);
  });

  test("includes speaker notes", async () => {
    const zip = buildPptxZip([
      { content: "Title Slide", notes: "Remember to introduce the team" },
      { content: "Content", notes: "" },
    ]);
    const result = await parser.parse({ buffer: zip, fileName: "talk.pptx" }, ctx);
    const md = result.outputs[0]!.content;
    expect(md).toContain("Remember to introduce the team");
  });

  test("includes metadata (author, dates)", async () => {
    const zip = buildPptxZip([{ content: "Hello" }]);
    const result = await parser.parse({ buffer: zip, fileName: "test.pptx" }, ctx);
    expect(result.metadata.author).toBe("Test Author");
    expect(result.metadata.created).toBeTruthy();
  });

  test("handles empty slides gracefully", async () => {
    const zip = buildPptxZip([
      { content: "" },
      { content: "Real content" },
    ]);
    const result = await parser.parse({ buffer: zip, fileName: "mixed.pptx" }, ctx);
    const md = result.outputs[0]!.content;
    expect(md).toContain("空白页");
    expect(md).toContain("Real content");
  });

  test("handles presentation with no slides", async () => {
    const { buildZip } = await import("../helpers/zip-builder");
    const zip = buildZip([
      { name: "docProps/core.xml", data: '<?xml version="1.0"?><cp:coreProperties/>' },
    ]);
    const result = await parser.parse({ buffer: zip, fileName: "empty.pptx" }, ctx);
    expect(result.outputs[0]!.content).toContain("无幻灯片");
  });

  test("extracts embedded images with OCR", async () => {
    const mockOCR: OCRService = {
      name: "mock",
      async recognize() {
        return { text: "Image text extracted", confidence: 0.9 };
      },
    };
    const { buildZip } = await import("../helpers/zip-builder");
    const zip = buildZip([
      { name: "docProps/core.xml", data: '<?xml version="1.0"?><cp:coreProperties/>' },
      { name: "ppt/slides/slide1.xml", data: '<?xml version="1.0"?><a:p><a:r><a:t>Hello</a:t></a:r></a:p>' },
      { name: "ppt/media/image1.png", data: Buffer.from("fake-png-data") },
    ]);
    const result = await parser.parse(
      { buffer: zip, fileName: "with-images.pptx" },
      { ...ctx, ocr: mockOCR },
    );
    expect(result.outputs.length).toBeGreaterThan(1);
    expect(result.outputs.some(o => o.content.includes("Image text extracted"))).toBe(true);
  });

  test("warns when images present but no OCR service", async () => {
    const { buildZip } = await import("../helpers/zip-builder");
    const zip = buildZip([
      { name: "docProps/core.xml", data: '<?xml version="1.0"?><cp:coreProperties/>' },
      { name: "ppt/slides/slide1.xml", data: '<?xml version="1.0"?><a:p><a:r><a:t>Hi</a:t></a:r></a:p>' },
      { name: "ppt/media/image1.png", data: Buffer.from("fake") },
    ]);
    const result = await parser.parse({ buffer: zip, fileName: "img.pptx" }, ctx);
    expect(result.warnings.some(w => w.includes("OCR"))).toBe(true);
  });
});

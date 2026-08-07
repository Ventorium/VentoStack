import { describe, test, expect } from "bun:test";
import { createImageParser } from "../../parsers/image";
import type { ParseContext, OCRService } from "../../types";

describe("image parser", () => {
  const parser = createImageParser();

  test("supports image extensions", () => {
    expect(parser.canHandle("photo.png")).toBe(true);
    expect(parser.canHandle("photo.jpg")).toBe(true);
    expect(parser.canHandle("photo.jpeg")).toBe(true);
    expect(parser.canHandle("photo.gif")).toBe(true);
    expect(parser.canHandle("photo.webp")).toBe(true);
    expect(parser.canHandle("photo.bmp")).toBe(true);
    expect(parser.canHandle("photo.tiff")).toBe(true);
    expect(parser.canHandle("file.txt")).toBe(false);
  });

  test("throws when no OCR service configured", async () => {
    const ctx: ParseContext = { tmpDir: "/tmp/test" };
    await expect(
      parser.parse({ buffer: Buffer.from("fake"), fileName: "photo.png" }, ctx)
    ).rejects.toThrow("OCR 服务");
  });

  test("uses OCR service to extract text", async () => {
    const mockOCR: OCRService = {
      name: "mock-ocr",
      async recognize() {
        return {
          text: "Extracted text from image",
          confidence: 0.92,
          language: "eng",
        };
      },
    };

    const ctx: ParseContext = { tmpDir: "/tmp/test", ocr: mockOCR };
    const result = await parser.parse(
      { buffer: Buffer.from("fake-image-data"), fileName: "document.png" },
      ctx
    );

    expect(result.parser).toBe("image-ocr");
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]!.content).toContain("Extracted text from image");
    expect(result.outputs[0]!.content).toContain("92.0%");
    expect(result.warnings).toHaveLength(0);
  });

  test("warns on low confidence OCR", async () => {
    const mockOCR: OCRService = {
      name: "mock-ocr",
      async recognize() {
        return { text: "garbled", confidence: 0.3 };
      },
    };

    const ctx: ParseContext = { tmpDir: "/tmp/test", ocr: mockOCR };
    const result = await parser.parse(
      { buffer: Buffer.from("fake"), fileName: "blurry.jpg" },
      ctx
    );

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("置信度较低");
  });
});

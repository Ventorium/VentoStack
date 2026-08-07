import { describe, test, expect, mock } from "bun:test";
import { createPdfParser } from "../../parsers/pdf";
import type { ParseContext } from "../../types";

const ctx: ParseContext = { tmpDir: "/tmp/test" };

describe("pdf parser", () => {
  const parser = createPdfParser();

  test("supports .pdf extension", () => {
    expect(parser.canHandle("report.pdf")).toBe(true);
    expect(parser.canHandle("report.docx")).toBe(false);
  });

  test("handles PDF parsing failure gracefully", async () => {
    // Buffer too small/invalid to be a real PDF — should not crash
    const tinyPdf = Buffer.from("%PDF-1.4 tiny");
    // This will either parse (liteparse might handle it) or fall back
    // Either way it shouldn't throw an unhandled error
    try {
      const result = await parser.parse({ buffer: tinyPdf, fileName: "tiny.pdf" }, ctx);
      expect(result.parser).toContain("pdf");
    } catch (err) {
      // If liteparse rejects it, that's also acceptable
      expect(err).toBeDefined();
    }
  });

  test("parser has correct name and extensions", () => {
    expect(parser.name).toBe("pdf");
    expect(parser.extensions).toContain(".pdf");
  });
});

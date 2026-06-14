import { describe, test, expect } from "bun:test";
import { createXlsxParser } from "../../parsers/xlsx";
import type { ParseContext } from "../../types";

const ctx: ParseContext = { tmpDir: "/tmp/test" };

describe("xlsx parser", () => {
  const parser = createXlsxParser();

  test("supports .xlsx extension", () => {
    expect(parser.canHandle("data.xlsx")).toBe(true);
    expect(parser.canHandle("file.xls")).toBe(false);
  });

  test("handles missing workbook.xml", async () => {
    // Empty ZIP
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 8);
    eocd.writeUInt16LE(0, 10);
    eocd.writeUInt32LE(0, 12);
    eocd.writeUInt32LE(0, 16);

    const result = await parser.parse({ buffer: eocd, fileName: "empty.xlsx" }, ctx);
    expect(result.outputs[0]!.content).toContain("无法解析");
  });
});

import { describe, test, expect } from "bun:test";
import { createXlsxParser } from "../../parsers/xlsx";
import { buildXlsxZip } from "../helpers/zip-builder";
import type { ParseContext } from "../../types";

const ctx: ParseContext = { tmpDir: "/tmp/test" };

describe("xlsx parser — full content", () => {
  const parser = createXlsxParser();

  test("parses workbook with multiple sheets", async () => {
    const zip = buildXlsxZip([
      {
        name: "Sales",
        rows: [
          ["Product", "Q1", "Q2", "Q3"],
          ["Widget", "100", "200", "300"],
          ["Gadget", "150", "250", "350"],
        ],
      },
      {
        name: "Expenses",
        rows: [
          ["Category", "Amount"],
          ["Rent", "5000"],
          ["Utilities", "1200"],
        ],
      },
    ]);
    const result = await parser.parse({ buffer: zip, fileName: "report.xlsx" }, ctx);

    expect(result.parser).toBe("xlsx");
    expect(result.metadata.sheetCount).toBe(2);

    // Should have: main index + 2 sheet files = 3 outputs
    expect(result.outputs.length).toBeGreaterThanOrEqual(3);

    const mainMd = result.outputs[0]!.content;
    expect(mainMd).toContain("# report");
    expect(mainMd).toContain("工作表数：2");
    expect(mainMd).toContain("Sales");
    expect(mainMd).toContain("Expenses");

    // Sheet-specific output
    const salesOutput = result.outputs.find(o => o.relativePath.includes("Sales"));
    expect(salesOutput).toBeTruthy();
    expect(salesOutput!.content).toContain("Product");
    expect(salesOutput!.content).toContain("Widget");
    expect(salesOutput!.content).toContain("| Q1 |");
  });

  test("includes metadata", async () => {
    const zip = buildXlsxZip([{ name: "Sheet1", rows: [["A", "B"], ["1", "2"]] }]);
    const result = await parser.parse({ buffer: zip, fileName: "data.xlsx" }, ctx);
    expect(result.metadata.author).toBe("Test Author");
    expect(result.metadata.created).toBeTruthy();
  });

  test("handles empty sheet", async () => {
    const zip = buildXlsxZip([{ name: "Empty", rows: [] }]);
    const result = await parser.parse({ buffer: zip, fileName: "empty.xlsx" }, ctx);
    const md = result.outputs[0]!.content;
    expect(md).toContain("空工作表");
  });

  test("handles sheet with only headers", async () => {
    const zip = buildXlsxZip([
      { name: "Headers", rows: [["Name", "Age"]] },
    ]);
    const result = await parser.parse({ buffer: zip, fileName: "headers.xlsx" }, ctx);
    const sheetOutput = result.outputs.find(o => o.relativePath.includes("Headers"));
    expect(sheetOutput).toBeTruthy();
    expect(sheetOutput!.content).toContain("| Name | Age |");
    expect(sheetOutput!.content).toContain("| --- | --- |");
  });
});

import { describe, test, expect } from "bun:test";
import { createNativeParser, buildOptionsJson } from "../../parsers/native";
import type { ParseContext } from "../../types";
import { buildDocxZip, buildXlsxZip } from "../helpers/zip-builder";

const ctx: ParseContext = { tmpDir: "/tmp/test" };

/** @ventostack/file-parser 0.2.0 发布并安装后，委托用例才真正运行 */
async function tryImportNative(): Promise<boolean> {
  try {
    await import("@ventostack/file-parser");
    return true;
  } catch {
    return false;
  }
}

describe("native parser — optionsJson mapping", () => {
  test("no OCR config yields undefined", () => {
    expect(buildOptionsJson(undefined)).toBeUndefined();
    expect(buildOptionsJson({ endpoint: "" })).toBeUndefined();
  });

  test("endpoint/headers/model map onto paddleOcr", () => {
    expect(buildOptionsJson({
      endpoint: "https://ocr.example.com/api/v2/ocr/jobs",
      headers: { Authorization: "bearer tok" },
      model: "PaddleOCR-VL-1.6",
    })).toBe(JSON.stringify({
      paddleOcr: {
        endpoint: "https://ocr.example.com/api/v2/ocr/jobs",
        headers: { Authorization: "bearer tok" },
        model: "PaddleOCR-VL-1.6",
      },
    }));
  });

  test("language maps onto convert.ocrLanguage", () => {
    expect(buildOptionsJson({
      endpoint: "https://ocr.example.com/api/v2/ocr/jobs",
      language: "chi_sim",
    })).toBe(JSON.stringify({
      paddleOcr: { endpoint: "https://ocr.example.com/api/v2/ocr/jobs" },
      convert: { ocrLanguage: "chi_sim" },
    }));
  });

  test("claims document/pdf/html/image extensions only", () => {
    const parser = createNativeParser();
    for (const name of [
      "a.docx", "b.doc", "c.pptx", "d.xlsx", "e.xls", "f.odt",
      "g.pdf", "h.html", "i.htm", "j.xhtml", "k.epub", "l.csv", "m.png",
    ]) {
      expect(parser.canHandle(name), name).toBe(true);
    }
    // 文本类归 fence，压缩包归 zip
    for (const name of ["a.txt", "b.md", "c.ts", "d.json", "e.zip", "f.log"]) {
      expect(parser.canHandle(name), name).toBe(false);
    }
  });
});

describe("native parser — delegation", () => {
  test("converts an in-memory docx via the Rust parser", async () => {
    if (!(await tryImportNative())) return;
    const parser = createNativeParser();
    const docx = buildDocxZip(
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
         <w:body><w:p><w:r><w:t>Hello native</w:t></w:r></w:p></w:body>
       </w:document>`,
    );
    const result = await parser.parse({ buffer: docx, fileName: "hello.docx" }, ctx);
    expect(result.parser).toBe("file-parser");
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]!.relativePath).toBe("hello.md");
    expect(result.outputs[0]!.content).toContain("Hello native");
    expect(result.outputs[0]!.title).toBeTruthy();
  });

  test("converts an in-memory xlsx via the Rust parser", async () => {
    if (!(await tryImportNative())) return;
    const parser = createNativeParser();
    const xlsx = buildXlsxZip([{ name: "Sheet1", rows: [["Name", "Age"], ["Alice", "30"]] }]);
    const result = await parser.parse({ buffer: xlsx, fileName: "data.xlsx" }, ctx);
    expect(result.parser).toBe("file-parser");
    expect(result.outputs[0]!.content).toContain("Alice");
    expect(result.outputs[0]!.content).toContain("|");
  });

  test("converts html with a # title from the Rust parser", async () => {
    if (!(await tryImportNative())) return;
    const parser = createNativeParser();
    const html = Buffer.from(
      "<html><head><title>Page</title></head><body><h1>Heading</h1><p>Text</p></body></html>",
    );
    const result = await parser.parse({ buffer: html, fileName: "page.html" }, ctx);
    expect(result.outputs[0]!.content).toContain("# Heading");
    expect(result.outputs[0]!.content).toContain("Text");
    // 标题取输出的首个 # 标题（<title> 生成的文档标题行在前）
    expect(result.outputs[0]!.title).toBe("Page");
  });
});

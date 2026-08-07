import { describe, test, expect } from "bun:test";
import { createFile2MdModule } from "../module";

describe("file2md module", () => {
  test("creates module with default config", () => {
    const mod = createFile2MdModule();
    expect(mod.convertFile).toBeInstanceOf(Function);
    expect(mod.convertBatch).toBeInstanceOf(Function);
    expect(mod.getSupportedFormats).toBeInstanceOf(Function);
    expect(mod.registerParser).toBeInstanceOf(Function);
    expect(mod.registerRule).toBeInstanceOf(Function);
  });

  test("getSupportedFormats returns a list", () => {
    const mod = createFile2MdModule();
    const formats = mod.getSupportedFormats();
    expect(formats.length).toBeGreaterThan(20);
    expect(formats).toContain(".md");
    expect(formats).toContain(".pdf");
  });

  test("convertFile works end-to-end", async () => {
    const mod = createFile2MdModule();
    const result = await mod.convertFile(Buffer.from("# Hello"), "test.md");
    expect(result.parser).toBe("markdown");
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]!.content).toBe("# Hello");
  });

  test("convertBatch works end-to-end", async () => {
    const mod = createFile2MdModule();
    const results = await mod.convertBatch([
      { buffer: Buffer.from("# A"), fileName: "a.md" },
      { buffer: Buffer.from("log line"), fileName: "b.txt" },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0]!.parser).toBe("markdown");
    expect(results[1]!.parser).toBe("text");
  });

  test("module accepts custom OCR service", async () => {
    const mod = createFile2MdModule({
      ocr: {
        name: "test-ocr",
        async recognize() {
          return { text: "OCR result", confidence: 0.95 };
        },
      },
    });
    const result = await mod.convertFile(Buffer.from("fake-img"), "photo.png");
    expect(result.outputs[0]!.content).toContain("OCR result");
  });

  test("module respects default cleaner config", async () => {
    const mod = createFile2MdModule({
      defaultCleaner: { enabled: false },
    });
    const result = await mod.convertFile(Buffer.from("Hello\n\n\n\nWorld"), "test.md");
    // Cleaner disabled, blank lines preserved
    expect(result.outputs[0]!.content).toMatch(/\n{3,}/);
  });

  test("registerParser adds a custom parser", async () => {
    const mod = createFile2MdModule();
    mod.registerParser({
      name: "custom-viz",
      extensions: [".viz"],
      canHandle: (f) => f.endsWith(".viz"),
      async parse(input) {
        return {
          sourceFileName: input.fileName,
          outputs: [{ relativePath: "out.md", content: "# Custom Viz", title: "viz" }],
          parser: "custom-viz",
          duration: 0,
          warnings: [],
          metadata: {},
        };
      },
    });
    const result = await mod.convertFile(Buffer.from("data"), "diagram.viz");
    expect(result.parser).toBe("custom-viz");
    expect(result.outputs[0]!.content).toBe("# Custom Viz");
  });
});

import { describe, test, expect } from "bun:test";
import { createParserRegistry } from "../../registry";
import { registerAllParsers } from "../../parsers";

describe("parser registry", () => {
  test("resolves markdown parser for .md files", () => {
    const registry = createParserRegistry();
    registerAllParsers(registry);

    const parser = registry.resolve("readme.md");
    expect(parser?.name).toBe("markdown");
  });

  test("resolves text parser for .txt files", () => {
    const registry = createParserRegistry();
    registerAllParsers(registry);

    const parser = registry.resolve("log.txt");
    expect(parser?.name).toBe("text");
  });

  test("resolves code parser for .ts files", () => {
    const registry = createParserRegistry();
    registerAllParsers(registry);

    const parser = registry.resolve("app.ts");
    expect(parser?.name).toBe("code");
  });

  test("resolves structured parser for .json files", () => {
    const registry = createParserRegistry();
    registerAllParsers(registry);

    const parser = registry.resolve("config.json");
    expect(parser?.name).toBe("structured");
  });

  test("resolves image parser for .png files", () => {
    const registry = createParserRegistry();
    registerAllParsers(registry);

    const parser = registry.resolve("photo.png");
    expect(parser?.name).toBe("image");
  });

  test("resolves pdf parser for .pdf files", () => {
    const registry = createParserRegistry();
    registerAllParsers(registry);

    const parser = registry.resolve("report.pdf");
    expect(parser?.name).toBe("pdf");
  });

  test("resolves unsupported parser for unknown extensions", () => {
    const registry = createParserRegistry();
    registerAllParsers(registry);

    const parser = registry.resolve("file.xyz");
    expect(parser?.name).toBe("unsupported");
  });

  test("getSupportedExtensions returns all registered extensions", () => {
    const registry = createParserRegistry();
    registerAllParsers(registry);

    const exts = registry.getSupportedExtensions();
    expect(exts).toContain(".md");
    expect(exts).toContain(".txt");
    expect(exts).toContain(".ts");
    expect(exts).toContain(".pdf");
    expect(exts).toContain(".docx");
    expect(exts).toContain(".xlsx");
    expect(exts).toContain(".pptx");
    expect(exts).toContain(".html");
    expect(exts).toContain(".png");
    expect(exts).toContain(".zip");
    expect(exts).toContain(".epub");
    expect(exts).toContain(".csv");
  });

  test("custom parser takes priority for matching extensions", () => {
    const registry = createParserRegistry();
    registerAllParsers(registry);

    // Register a custom parser that overrides .md
    registry.register({
      name: "custom-md",
      extensions: [".md"],
      canHandle: () => true,
      async parse() {
        return {
          sourceFileName: "test.md",
          outputs: [],
          parser: "custom-md",
          duration: 0,
          warnings: [],
          metadata: {},
        };
      },
    });

    // The custom parser is registered last, so extension map points to it
    const parser = registry.resolve("test.md");
    expect(parser?.name).toBe("custom-md");
  });
});

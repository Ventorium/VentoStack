import { describe, test, expect } from "bun:test";
import { createEpubParser } from "../../parsers/epub";
import { buildEpubZip } from "../helpers/zip-builder";
import type { ParseContext } from "../../types";

const ctx: ParseContext = { tmpDir: "/tmp/test" };

describe("epub parser", () => {
  const parser = createEpubParser();

  test("supports .epub extension", () => {
    expect(parser.canHandle("book.epub")).toBe(true);
    expect(parser.canHandle("book.pdf")).toBe(false);
  });

  test("parses multi-chapter epub", async () => {
    const epub = buildEpubZip([
      { title: "Chapter 1: Beginning", body: "It was a dark and stormy night." },
      { title: "Chapter 2: Middle", body: "Things got interesting." },
      { title: "Chapter 3: End", body: "And they lived happily ever after." },
    ]);
    const result = await parser.parse({ buffer: epub, fileName: "novel.epub" }, ctx);

    expect(result.parser).toBe("epub");
    const md = result.outputs[0]!.content;

    // Title
    expect(md).toContain("# Test Book");
    // Metadata
    expect(md).toContain("作者");
    expect(md).toContain("章节数：3");
    // Table of contents
    expect(md).toContain("## 目录");
    expect(md).toContain("1. Chapter 1: Beginning");
    expect(md).toContain("2. Chapter 2: Middle");
    // Chapter content
    expect(md).toContain("dark and stormy night");
    expect(md).toContain("Things got interesting");
    expect(md).toContain("happily ever after");
  });

  test("includes metadata from OPF", async () => {
    const epub = buildEpubZip([
      { title: "Intro", body: "Hello world" },
    ]);
    const result = await parser.parse({ buffer: epub, fileName: "test.epub" }, ctx);
    expect(result.metadata.title).toBe("Test Book");
    expect(result.metadata.creator).toBe("Test Author");
    expect(result.metadata.language).toBe("en");
  });

  test("handles single-chapter epub", async () => {
    const epub = buildEpubZip([
      { title: "The Only Chapter", body: "Everything in one place." },
    ]);
    const result = await parser.parse({ buffer: epub, fileName: "short.epub" }, ctx);
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]!.content).toContain("The Only Chapter");
    expect(result.outputs[0]!.content).toContain("Everything in one place.");
  });
});

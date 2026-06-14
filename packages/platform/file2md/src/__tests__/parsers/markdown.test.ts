import { describe, test, expect } from "bun:test";
import { createMarkdownParser } from "../../parsers/markdown";
import type { ParseContext } from "../../types";

const ctx: ParseContext = { tmpDir: "/tmp/test" };

describe("markdown parser", () => {
  const parser = createMarkdownParser();

  test("supports .md and .mdx", () => {
    expect(parser.canHandle("readme.md")).toBe(true);
    expect(parser.canHandle("page.mdx")).toBe(true);
    expect(parser.canHandle("file.txt")).toBe(false);
  });

  test("passes through markdown content unchanged", async () => {
    const md = "# Hello\n\nSome **bold** text.\n\n- item 1\n- item 2";
    const result = await parser.parse({ buffer: Buffer.from(md), fileName: "readme.md" }, ctx);
    expect(result.outputs[0]!.content).toBe(md);
    expect(result.parser).toBe("markdown");
  });

  test("preserves original filename as path", async () => {
    const result = await parser.parse({ buffer: Buffer.from("# Hi"), fileName: "docs/guide.md" }, ctx);
    expect(result.outputs[0]!.relativePath).toBe("docs/guide.md");
  });
});

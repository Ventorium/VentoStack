import { describe, test, expect } from "bun:test";
import { createZipParser } from "../../parsers/zip";
import { buildZip } from "../helpers/zip-builder";
import type { ParseContext } from "../../types";

const ctx: ParseContext = { tmpDir: "/tmp/test" };

describe("zip parser", () => {
  const parser = createZipParser();

  test("supports .zip extension", () => {
    expect(parser.canHandle("archive.zip")).toBe(true);
    expect(parser.canHandle("file.rar")).toBe(false);
  });

  test("parses zip with mixed file types", async () => {
    const zip = buildZip([
      { name: "readme.md", data: "# Hello\n\nWorld" },
      { name: "src/app.ts", data: 'const x = 1;' },
      { name: "config.json", data: '{"key":"value"}' },
      { name: "notes.txt", data: "Some notes" },
    ]);
    const result = await parser.parse({ buffer: zip, fileName: "project.zip" }, ctx);

    expect(result.parser).toBe("zip");
    expect(result.metadata.processed).toBe(4);

    // Main index
    const indexMd = result.outputs[0]!.content;
    expect(indexMd).toContain("# project");
    expect(indexMd).toContain("目录结构");
    expect(indexMd).toContain("readme.md");
    expect(indexMd).toContain("app.ts");

    // Should have outputs for each file
    expect(result.outputs.length).toBeGreaterThan(1);
  });

  test("preserves directory hierarchy in output paths", async () => {
    const zip = buildZip([
      { name: "src/components/Button.tsx", data: "export const Button = () => {};" },
      { name: "src/utils/helper.ts", data: "export function help() {}" },
      { name: "docs/README.md", data: "# Docs" },
    ]);
    const result = await parser.parse({ buffer: zip, fileName: "app.zip" }, ctx);

    const paths = result.outputs.map(o => o.relativePath);
    expect(paths.some(p => p.includes("src/components"))).toBe(true);
    expect(paths.some(p => p.includes("src/utils"))).toBe(true);
    expect(paths.some(p => p.includes("docs"))).toBe(true);
  });

  test("skips __MACOSX entries", async () => {
    const zip = buildZip([
      { name: "file.txt", data: "content" },
      { name: "__MACOSX/._file.txt", data: "resource fork" },
    ]);
    const result = await parser.parse({ buffer: zip, fileName: "mac.zip" }, ctx);
    expect(result.metadata.processed).toBe(1);
  });

  test("skips directory-only entries (trailing /)", async () => {
    const zip = buildZip([
      { name: "src/", data: "" },
      { name: "src/app.ts", data: "const x = 1;" },
    ]);
    const result = await parser.parse({ buffer: zip, fileName: "dirs.zip" }, ctx);
    // Only the file should be processed, not the directory entry
    expect(result.metadata.processed).toBe(1);
  });

  test("warns on unsupported files inside zip", async () => {
    const zip = buildZip([
      { name: "good.md", data: "# Hello" },
      { name: "video.mp4", data: Buffer.from("fake-mp4") },
    ]);
    const result = await parser.parse({ buffer: zip, fileName: "mixed.zip" }, ctx);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => w.includes("video.mp4") || w.includes("跳过"))).toBe(true);
  });

  test("handles empty zip", async () => {
    const zip = buildZip([]);
    const result = await parser.parse({ buffer: zip, fileName: "empty.zip" }, ctx);
    expect(result.outputs[0]!.content).toContain("空的 ZIP 文件");
  });

  test("handles corrupted zip", async () => {
    const badBuffer = Buffer.from("not a zip file");
    await expect(
      parser.parse({ buffer: badBuffer, fileName: "bad.zip" }, ctx)
    ).rejects.toThrow("ZIP 解压失败");
  });

  test("respects maxDepth", async () => {
    const zip = buildZip([
      { name: "readme.md", data: "# Hi" },
    ]);
    const result = await parser.parse(
      { buffer: zip, fileName: "deep.zip" },
      { ...ctx, maxDepth: 0, currentDepth: 5 },
    );
    expect(result.warnings.some(w => w.includes("深度"))).toBe(true);
    expect(result.outputs[0]!.content).toContain("嵌套深度");
  });
});

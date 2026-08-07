/**
 * Markdown 文件解析器
 * .md / .mdx 直接透传
 */
import { extname } from "node:path";
import type { FileParser, ParseInput, ParseContext, ConvertResult } from "../types";

export function createMarkdownParser(): FileParser {
  return {
    name: "markdown",
    extensions: [".md", ".mdx"],

    canHandle(fileName: string): boolean {
      const ext = extname(fileName).toLowerCase();
      return ext === ".md" || ext === ".mdx";
    },

    async parse(input: ParseInput, _ctx: ParseContext): Promise<ConvertResult> {
      const { buffer, fileName } = input;
      const baseName = fileName.replace(/\.[^.]+$/, "");
      const content = buffer.toString("utf-8");

      return {
        sourceFileName: fileName,
        outputs: [{ relativePath: fileName, content, title: baseName }],
        parser: "markdown",
        duration: 0,
        warnings: [],
        metadata: { size: buffer.length },
      };
    },
  };
}

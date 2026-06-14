/**
 * 结构化数据解析器
 * JSON / YAML / TOML / XML / CSV / TSV
 * 和纯文本一样用 code-fence 包裹
 */
import { extname } from "node:path";
import type { FileParser, ParseInput, ParseContext, ConvertResult } from "../types";

const STRUCTURED_EXTENSIONS: Record<string, string> = {
  ".json": "json", ".jsonc": "json",
  ".yaml": "yaml", ".yml": "yaml",
  ".toml": "toml",
  ".xml": "xml",
  ".csv": "csv", ".tsv": "tsv",
};

export function createStructuredParser(): FileParser {
  return {
    name: "structured",
    extensions: Object.keys(STRUCTURED_EXTENSIONS),

    canHandle(fileName: string): boolean {
      const ext = extname(fileName).toLowerCase();
      return ext in STRUCTURED_EXTENSIONS;
    },

    async parse(input: ParseInput, _ctx: ParseContext): Promise<ConvertResult> {
      const { buffer, fileName } = input;
      const ext = extname(fileName).toLowerCase();
      const lang = STRUCTURED_EXTENSIONS[ext] ?? "text";
      const baseName = fileName.replace(/\.[^.]+$/, "");
      const content = buffer.toString("utf-8");

      const md = [
        `# ${baseName}`,
        "",
        "```" + lang,
        content,
        "```",
      ].join("\n");

      return {
        sourceFileName: fileName,
        outputs: [{ relativePath: `${baseName}.md`, content: md, title: baseName }],
        parser: "structured",
        duration: 0,
        warnings: [],
        metadata: { format: lang, originalExtension: ext, size: buffer.length },
      };
    },
  };
}

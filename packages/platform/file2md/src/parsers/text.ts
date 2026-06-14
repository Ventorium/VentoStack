/**
 * 纯文本文件解析器
 * txt / log / ini / cfg / env / conf / properties 等
 */
import { extname, basename } from "node:path";
import type { FileParser, ParseInput, ParseContext, ConvertResult } from "../types";

const TEXT_EXTENSIONS = new Set([
  ".txt", ".log", ".ini", ".cfg", ".env", ".conf",
  ".properties", ".gitignore", ".editorconfig",
  ".dockerignore", ".npmrc", ".yarnrc", ".prettierrc",
  ".eslintrc", ".babelrc",
]);

/** 以 . 开头的文件名（dotfiles），无扩展名但应视为文本 */
const DOTFILE_NAMES = new Set([
  ".env", ".env.local", ".env.dev", ".env.prod", ".env.test", ".env.staging",
  ".gitignore", ".editorconfig", ".dockerignore", ".npmrc", ".yarnrc",
  ".prettierrc", ".eslintrc", ".babelrc",
]);

function getEffectiveExtension(fileName: string): string {
  const ext = extname(fileName).toLowerCase();
  if (ext) return ext;
  // dotfile: 整个文件名即为"扩展名"
  const name = fileName.startsWith(".") ? fileName : `.${fileName}`;
  if (DOTFILE_NAMES.has(name)) return name;
  // 按第一个 . 分割: .env.local → .env
  const dotPart = name.split(".")[1];
  return dotPart ? `.${dotPart}` : "";
}

export function createTextParser(): FileParser {
  return {
    name: "text",
    extensions: [...TEXT_EXTENSIONS],

    canHandle(fileName: string): boolean {
      const ext = getEffectiveExtension(fileName);
      return TEXT_EXTENSIONS.has(ext) || DOTFILE_NAMES.has(fileName);
    },

    async parse(input: ParseInput, _ctx: ParseContext): Promise<ConvertResult> {
      const { buffer, fileName } = input;
      const ext = getEffectiveExtension(fileName).replace(/^\./, "") || "txt";
      const baseName = fileName.replace(/\.[^.]+$/, "") || fileName;
      const content = buffer.toString("utf-8");

      const md = [
        `# ${baseName}`,
        "",
        "```" + ext,
        content,
        "```",
      ].join("\n");

      return {
        sourceFileName: fileName,
        outputs: [{ relativePath: `${baseName}.md`, content: md, title: baseName }],
        parser: "text",
        duration: 0,
        warnings: [],
        metadata: { originalExtension: ext, size: buffer.length },
      };
    },
  };
}

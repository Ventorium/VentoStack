/**
 * 文本兜底解析器
 *
 * 合并原 text/code/markdown/structured 四个解析器：
 * - .md/.mdx 直通
 * - 结构化数据（JSON/YAML/XML/TSV…）与源代码用 code-fence 包裹
 * - 纯文本（txt/log/ini/dotfile…）用扩展名作语言标识包裹
 *
 * 只接管 Rust file-parser 不认识的文本扩展；
 * 其余格式由 native 解析器在前、unsupported 在后兜底。
 */
import { extname } from "node:path";
import type { FileParser, ParseInput, ParseContext, ConvertResult } from "../types";

/** Markdown 直通 */
const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx"]);

/** 结构化数据扩展名 → fence 语言 */
const STRUCTURED_EXTENSIONS: Record<string, string> = {
  ".json": "json", ".jsonc": "json",
  ".yaml": "yaml", ".yml": "yaml",
  ".toml": "toml",
  ".xml": "xml",
  ".tsv": "tsv",
};

/** 源代码扩展名 → 语言标识（用于 ```lang） */
const LANG_MAP: Record<string, string> = {
  ".ts": "typescript", ".tsx": "tsx",
  ".js": "javascript", ".jsx": "jsx",
  ".mjs": "javascript", ".cjs": "javascript",
  ".py": "python", ".pyw": "python",
  ".rb": "ruby", ".go": "go",
  ".rs": "rust", ".java": "java",
  ".kt": "kotlin", ".kts": "kotlin",
  ".c": "c", ".h": "c",
  ".cpp": "cpp", ".cc": "cpp", ".cxx": "cpp", ".hpp": "cpp",
  ".cs": "csharp", ".fs": "fsharp",
  ".swift": "swift", ".scala": "scala",
  ".php": "php", ".pl": "perl", ".pm": "perl",
  ".lua": "lua", ".r": "r", ".R": "r",
  ".sql": "sql", ".graphql": "graphql", ".gql": "graphql",
  ".sh": "bash", ".bash": "bash", ".zsh": "zsh",
  ".ps1": "powershell", ".bat": "batch", ".cmd": "batch",
  ".dart": "dart", ".ex": "elixir", ".exs": "elixir",
  ".erl": "erlang", ".hrl": "erlang",
  ".hs": "haskell", ".ml": "ocaml",
  ".vue": "vue", ".svelte": "svelte",
  ".css": "css", ".scss": "scss", ".sass": "sass", ".less": "less",
  ".tf": "hcl", ".hcl": "hcl",
  ".proto": "protobuf", ".zig": "zig",
  ".nim": "nim", ".v": "v", ".vsh": "v",
};

/** 纯文本扩展名 */
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

const ALL_EXTENSIONS = [...new Set([
  ...MARKDOWN_EXTENSIONS,
  ...Object.keys(STRUCTURED_EXTENSIONS),
  ...Object.keys(LANG_MAP),
  ...TEXT_EXTENSIONS,
  ...DOTFILE_NAMES,
])];

/** dotfile 的"扩展名"：整个文件名（.env.local → .env） */
function getEffectiveExtension(fileName: string): string {
  const ext = extname(fileName).toLowerCase();
  if (ext) return ext;
  const name = fileName.startsWith(".") ? fileName : `.${fileName}`;
  if (DOTFILE_NAMES.has(name)) return name;
  const dotPart = name.split(".")[1];
  return dotPart ? `.${dotPart}` : "";
}

export function createFenceParser(): FileParser {
  return {
    name: "fence",
    extensions: ALL_EXTENSIONS,

    canHandle(fileName: string): boolean {
      if (MARKDOWN_EXTENSIONS.has(extname(fileName).toLowerCase())) return true;
      const ext = getEffectiveExtension(fileName);
      return ext in STRUCTURED_EXTENSIONS || ext in LANG_MAP || TEXT_EXTENSIONS.has(ext);
    },

    async parse(input: ParseInput, _ctx: ParseContext): Promise<ConvertResult> {
      const { buffer, fileName } = input;
      const baseName = fileName.replace(/\.[^.]+$/, "") || fileName;
      const content = buffer.toString("utf-8");

      // .md / .mdx 直通
      if (MARKDOWN_EXTENSIONS.has(extname(fileName).toLowerCase())) {
        return {
          sourceFileName: fileName,
          outputs: [{ relativePath: fileName, content, title: baseName }],
          parser: "fence",
          duration: 0,
          warnings: [],
          metadata: { passthrough: true, size: buffer.length },
        };
      }

      const ext = getEffectiveExtension(fileName);
      let lang: string;
      let withSourceLine = false;
      if (ext in STRUCTURED_EXTENSIONS) {
        lang = STRUCTURED_EXTENSIONS[ext] ?? "text";
      } else if (ext in LANG_MAP) {
        lang = LANG_MAP[ext] ?? "text";
        withSourceLine = true; // 沿用原 code 解析器的源文件标注
      } else {
        lang = ext.replace(/^\./, "") || "txt";
      }

      const parts = [`# ${baseName}`, ""];
      if (withSourceLine) {
        parts.push(`> 源文件：\`${fileName}\``, "");
      }
      parts.push("```" + lang, content, "```");

      return {
        sourceFileName: fileName,
        outputs: [{ relativePath: `${baseName}.md`, content: parts.join("\n"), title: baseName }],
        parser: "fence",
        duration: 0,
        warnings: [],
        metadata: { language: lang, originalExtension: ext, size: buffer.length },
      };
    },
  };
}

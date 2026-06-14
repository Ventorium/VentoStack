/**
 * 源代码文件解析器
 * 与纯文本一样用 code-fence 包裹，但使用语言标识
 */
import { extname } from "node:path";
import type { FileParser, ParseInput, ParseContext, ConvertResult } from "../types";

/** 扩展名 → 语言标识（用于 ```lang） */
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
  ".toml": "toml",
};

const CODE_EXTENSIONS = Object.keys(LANG_MAP);

export function createCodeParser(): FileParser {
  return {
    name: "code",
    extensions: CODE_EXTENSIONS,

    canHandle(fileName: string): boolean {
      const ext = extname(fileName).toLowerCase();
      return ext in LANG_MAP;
    },

    async parse(input: ParseInput, _ctx: ParseContext): Promise<ConvertResult> {
      const { buffer, fileName } = input;
      const ext = extname(fileName).toLowerCase();
      const lang = LANG_MAP[ext] ?? "text";
      const baseName = fileName.replace(/\.[^.]+$/, "");
      const content = buffer.toString("utf-8");

      const md = [
        `# ${baseName}`,
        "",
        `> 源文件：\`${fileName}\``,
        "",
        "```" + lang,
        content,
        "```",
      ].join("\n");

      return {
        sourceFileName: fileName,
        outputs: [{ relativePath: `${baseName}.md`, content: md, title: baseName }],
        parser: "code",
        duration: 0,
        warnings: [],
        metadata: { language: lang, originalExtension: ext, size: buffer.length },
      };
    },
  };
}

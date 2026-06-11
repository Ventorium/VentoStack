/**
 * Prompt Template 加载器
 *
 * 从目录或文件加载 .md 模板文件，解析 YAML frontmatter。
 * 支持参数替换：$1, $@, $ARGUMENTS, ${@:N}, ${@:N:L}
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import type { PromptTemplate, PromptTemplateDiagnostic } from "./types";

interface TemplateFrontmatter {
  description?: string;
  "argument-hint"?: string;
  [key: string]: unknown;
}

/**
 * 解析 YAML frontmatter
 */
function parseFrontmatter<T extends Record<string, unknown>>(
  content: string,
): { frontmatter: T; body: string } | null {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.startsWith("---")) {
    return { frontmatter: {} as T, body: normalized };
  }
  const endIndex = normalized.indexOf("\n---", 3);
  if (endIndex === -1) {
    return { frontmatter: {} as T, body: normalized };
  }
  const yamlString = normalized.slice(4, endIndex);
  const body = normalized.slice(endIndex + 4).trim();

  const frontmatter = {} as Record<string, unknown>;
  for (const line of yamlString.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) continue;
    const key = trimmed.slice(0, colonIndex).trim();
    let value: unknown = trimmed.slice(colonIndex + 1).trim();
    if (
      typeof value === "string" &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (value === "true") value = true;
    else if (value === "false") value = false;
    frontmatter[key] = value;
  }

  return { frontmatter: frontmatter as T, body };
}

async function isDirectory(dirPath: string): Promise<boolean> {
  try {
    const s = await stat(dirPath);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function loadTemplateFromFile(
  filePath: string,
): Promise<{
  template: PromptTemplate | null;
  diagnostics: PromptTemplateDiagnostic[];
}> {
  const diagnostics: PromptTemplateDiagnostic[] = [];
  let rawContent: string;
  try {
    rawContent = await readFile(filePath, "utf-8");
  } catch (err) {
    diagnostics.push({
      type: "warning",
      code: "read_failed",
      message: err instanceof Error ? err.message : String(err),
      path: filePath,
    });
    return { template: null, diagnostics };
  }

  const parsed = parseFrontmatter<TemplateFrontmatter>(rawContent);
  if (!parsed) {
    diagnostics.push({
      type: "warning",
      code: "parse_failed",
      message: "Failed to parse frontmatter",
      path: filePath,
    });
    return { template: null, diagnostics };
  }

  const { frontmatter, body } = parsed;
  const firstLine = body.split("\n").find((line) => line.trim());
  let description =
    typeof frontmatter.description === "string"
      ? frontmatter.description
      : "";
  if (!description && firstLine) {
    description = firstLine.slice(0, 60);
    if (firstLine.length > 60) description += "...";
  }

  return {
    template: {
      name: basename(filePath).replace(/\.md$/i, ""),
      description,
      content: body,
      filePath,
    },
    diagnostics,
  };
}

/**
 * 从路径列表加载 prompt templates
 *
 * 目录输入：非递归加载直接子目录的 .md 文件
 * 文件输入：直接加载 .md 文件
 */
export async function loadPromptTemplates(
  paths: string | string[],
): Promise<{
  templates: PromptTemplate[];
  diagnostics: PromptTemplateDiagnostic[];
}> {
  const templates: PromptTemplate[] = [];
  const diagnostics: PromptTemplateDiagnostic[] = [];

  for (const path of Array.isArray(paths) ? paths : [paths]) {
    const resolvedPath = resolve(path);

    let s: import("node:fs").Stats;
    try {
      s = await stat(resolvedPath);
    } catch {
      continue; // 缺失路径静默跳过
    }

    if (s.isDirectory()) {
      let entries: string[];
      try {
        const dirEntries = await readdir(resolvedPath, {
          withFileTypes: true,
        });
        entries = dirEntries
          .filter((e) => e.isFile() && e.name.endsWith(".md"))
          .map((e) => e.name)
          .sort();
      } catch (err) {
        diagnostics.push({
          type: "warning",
          code: "read_failed",
          message: err instanceof Error ? err.message : String(err),
          path: resolvedPath,
        });
        continue;
      }

      for (const entry of entries) {
        const result = await loadTemplateFromFile(
          join(resolvedPath, entry),
        );
        if (result.template) templates.push(result.template);
        diagnostics.push(...result.diagnostics);
      }
    } else if (s.isFile() && resolvedPath.endsWith(".md")) {
      const result = await loadTemplateFromFile(resolvedPath);
      if (result.template) templates.push(result.template);
      diagnostics.push(...result.diagnostics);
    }
  }

  return { templates, diagnostics };
}

/**
 * 解析 shell 风格参数字符串
 */
export function parseCommandArgs(argsString: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuote: string | null = null;

  for (let i = 0; i < argsString.length; i++) {
    const char = argsString[i]!;
    if (inQuote) {
      if (char === inQuote) inQuote = null;
      else current += char;
    } else if (char === '"' || char === "'") {
      inQuote = char;
    } else if (char === " " || char === "\t") {
      if (current) {
        args.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }
  if (current) args.push(current);
  return args;
}

/**
 * 参数替换
 *
 * 支持: $1, $@, $ARGUMENTS, ${@:N}, ${@:N:L}
 */
export function substituteArgs(
  content: string,
  args: string[],
): string {
  let result = content;
  // $1, $2, ...
  result = result.replace(/\$(\d+)/g, (_, num: string) => {
    return args[parseInt(num, 10) - 1] ?? "";
  });
  // ${@:N} 和 ${@:N:L}
  result = result.replace(
    /\$\{@:(\d+)(?::(\d+))?\}/g,
    (_, startStr: string, lengthStr?: string) => {
      let start = parseInt(startStr, 10) - 1;
      if (start < 0) start = 0;
      if (lengthStr)
        return args.slice(start, start + parseInt(lengthStr, 10)).join(" ");
      return args.slice(start).join(" ");
    },
  );
  const allArgs = args.join(" ");
  result = result.replace(/\$ARGUMENTS/g, allArgs);
  result = result.replace(/\$@/g, allArgs);
  return result;
}

/**
 * 格式化模板调用
 */
export function formatPromptTemplateInvocation(
  template: PromptTemplate,
  args: string[] = [],
): string {
  return substituteArgs(template.content, args);
}

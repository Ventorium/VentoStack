/**
 * Skill 加载器
 *
 * 从目录递归加载 SKILL.md 文件，解析 YAML frontmatter。
 * 零第三方依赖：使用内置 frontmatter 解析器。
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { resolve, join, basename, dirname } from "node:path";
import type { Skill, SkillDiagnostic, SkillDiagnosticCode } from "./types";

const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;

interface SkillFrontmatter {
  name?: string;
  description?: string;
  "disable-model-invocation"?: boolean;
  [key: string]: unknown;
}

/**
 * 解析 YAML frontmatter（简单键值对，无需 yaml 库）
 * 支持 "key: value" 格式和布尔值
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

  // 简单 YAML 解析（支持 key: value 和布尔值）
  const frontmatter = {} as Record<string, unknown>;
  for (const line of yamlString.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) continue;
    const key = trimmed.slice(0, colonIndex).trim();
    let value: unknown = trimmed.slice(colonIndex + 1).trim();
    // 去除引号
    if (
      typeof value === "string" &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    // 布尔值
    if (value === "true") value = true;
    else if (value === "false") value = false;
    frontmatter[key] = value;
  }

  return { frontmatter: frontmatter as T, body };
}

function validateName(name: string, parentDirName: string): string[] {
  const errors: string[] = [];
  if (name !== parentDirName) {
    errors.push(
      `name "${name}" does not match parent directory "${parentDirName}"`,
    );
  }
  if (name.length > MAX_NAME_LENGTH) {
    errors.push(
      `name exceeds ${MAX_NAME_LENGTH} characters (${name.length})`,
    );
  }
  if (!/^[a-z0-9-]+$/.test(name)) {
    errors.push(
      "name contains invalid characters (must be lowercase a-z, 0-9, hyphens only)",
    );
  }
  if (name.startsWith("-") || name.endsWith("-")) {
    errors.push("name must not start or end with a hyphen");
  }
  if (name.includes("--")) {
    errors.push("name must not contain consecutive hyphens");
  }
  return errors;
}

function validateDescription(description: string | undefined): string[] {
  const errors: string[] = [];
  if (!description || description.trim() === "") {
    errors.push("description is required");
  } else if (description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(
      `description exceeds ${MAX_DESCRIPTION_LENGTH} characters (${description.length})`,
    );
  }
  return errors;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(dirPath: string): Promise<boolean> {
  try {
    const s = await stat(dirPath);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function loadSkillFromFile(
  filePath: string,
): Promise<{ skill: Skill | null; diagnostics: SkillDiagnostic[] }> {
  const diagnostics: SkillDiagnostic[] = [];

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
    return { skill: null, diagnostics };
  }

  const parsed = parseFrontmatter<SkillFrontmatter>(rawContent);
  if (!parsed) {
    diagnostics.push({
      type: "warning",
      code: "parse_failed",
      message: "Failed to parse frontmatter",
      path: filePath,
    });
    return { skill: null, diagnostics };
  }

  const { frontmatter, body } = parsed;
  const skillDir = dirname(filePath);
  const parentDirName = basename(skillDir);
  const description =
    typeof frontmatter.description === "string"
      ? frontmatter.description
      : undefined;

  for (const error of validateDescription(description)) {
    diagnostics.push({
      type: "warning",
      code: "invalid_metadata",
      message: error,
      path: filePath,
    });
  }

  const frontmatterName =
    typeof frontmatter.name === "string" ? frontmatter.name : undefined;
  const name = frontmatterName || parentDirName;
  for (const error of validateName(name, parentDirName)) {
    diagnostics.push({
      type: "warning",
      code: "invalid_metadata",
      message: error,
      path: filePath,
    });
  }

  if (!description || description.trim() === "") {
    return { skill: null, diagnostics };
  }

  return {
    skill: {
      name,
      description,
      content: body,
      filePath,
      disableModelInvocation:
        frontmatter["disable-model-invocation"] === true,
    },
    diagnostics,
  };
}

/**
 * 最小化 ignore 匹配器（零第三方依赖）
 * 支持 .gitignore / .ignore / .fdignore 常用语法：
 * - 注释（#）与空行
 * - 取反（!）
 * - 目录模式（结尾 /）
 * - 通配符（* ? **）
 * - 根锚定模式（开头 /，相对 skill 根目录）
 */
class IgnoreMatcher {
  private readonly patterns: Array<{ pattern: string; negated: boolean }> = [];

  add(rawLine: string): void {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) return;
    if (line.startsWith("\\#")) line = line.slice(1);
    let negated = false;
    if (line.startsWith("!")) {
      negated = true;
      line = line.slice(1);
    } else if (line.startsWith("\\!")) {
      line = line.slice(1);
    }
    if (!line) return;
    this.patterns.push({ pattern: line, negated });
  }

  /** 判断相对路径（目录需带尾 /）是否被忽略；取反模式可解除忽略 */
  ignores(relativePath: string): boolean {
    let ignored = false;
    for (const { pattern, negated } of this.patterns) {
      if (this.matches(pattern, relativePath)) ignored = !negated;
    }
    return ignored;
  }

  private matches(pattern: string, path: string): boolean {
    let p = pattern;
    const dirOnly = p.endsWith("/");
    if (dirOnly) p = p.slice(0, -1);

    // 统一去掉目标尾斜杠；目录是否匹配由模式结尾的 / 决定（裸模式同时匹配文件与目录）
    const target = path.endsWith("/") ? path.slice(0, -1) : path;

    // 根锚定：相对 root 匹配；否则任意层级匹配
    if (p.startsWith("/")) {
      return this.globMatch(p.slice(1), target);
    }
    if (this.globMatch(p, target)) return true;
    // 非根锚定模式也尝试匹配各子路径（如 "build" 匹配 "a/b/build"）
    const parts = target.split("/");
    for (let i = 0; i < parts.length; i++) {
      const sub = parts.slice(i).join("/");
      if (this.globMatch(p, sub)) return true;
    }
    return false;
  }

  private globMatch(pattern: string, path: string): boolean {
    return this.regexFromGlob(pattern).test(path);
  }

  private regexFromGlob(pattern: string): RegExp {
    let source = "^";
    let i = 0;
    while (i < pattern.length) {
      const c = pattern[i]!;
      if (c === "*") {
        if (pattern[i + 1] === "*") {
          // ** 匹配任意层级
          source += ".*";
          i += 2;
          // 吃掉后续单个 /
          if (pattern[i] === "/") i += 1;
        } else {
          source += "[^/]*";
          i += 1;
        }
      } else if (c === "?") {
        source += "[^/]";
        i += 1;
      } else if (c === "\\" && i + 1 < pattern.length) {
        source += pattern[i + 1]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        i += 2;
      } else {
        source += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        i += 1;
      }
    }
    source += "$";
    return new RegExp(source);
  }
}

async function loadSkillsFromDir(
  dir: string,
  includeRootFiles: boolean,
  ignoreMatcher: IgnoreMatcher,
  rootDir: string,
): Promise<{ skills: Skill[]; diagnostics: SkillDiagnostic[] }> {
  const skills: Skill[] = [];
  const diagnostics: SkillDiagnostic[] = [];

  if (!(await isDirectory(dir))) return { skills, diagnostics };

  // 读取本目录的 ignore 文件（.gitignore / .ignore / .fdignore）
  for (const ignoreName of [".gitignore", ".ignore", ".fdignore"]) {
    const ignorePath = join(dir, ignoreName);
    if (await fileExists(ignorePath)) {
      try {
        const content = await readFile(ignorePath, "utf-8");
        const relPrefix = relativePath(rootDir, dir);
        for (const line of content.split(/\r?\n/)) {
          if (!line.trim() || line.trim().startsWith("#")) continue;
          // 将模式前缀到当前目录相对 root 的路径，使其在全局坐标系下生效
          const prefixed = prefixPattern(line, relPrefix);
          if (prefixed) ignoreMatcher.add(prefixed);
        }
      } catch {
        /* 读取失败静默跳过 */
      }
    }
  }

  let entries: string[];
  try {
    const dirEntries = await readdir(dir, { withFileTypes: true });
    entries = dirEntries.map((e) => e.name);
  } catch (err) {
    diagnostics.push({
      type: "warning",
      code: "file_info_failed",
      message: err instanceof Error ? err.message : String(err),
      path: dir,
    });
    return { skills, diagnostics };
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry);

    if (entry === "SKILL.md") {
      if (ignoreMatcher.ignores(relativePath(rootDir, fullPath))) continue;
      const result = await loadSkillFromFile(fullPath);
      if (result.skill) skills.push(result.skill);
      diagnostics.push(...result.diagnostics);
      continue;
    }

    // 递归子目录
    if (await isDirectory(fullPath)) {
      // 跳过隐藏目录与 node_modules
      if (entry.startsWith(".") || entry === "node_modules") continue;
      if (ignoreMatcher.ignores(`${relativePath(rootDir, fullPath)}/`)) continue;
      const subResult = await loadSkillsFromDir(fullPath, false, ignoreMatcher, rootDir);
      skills.push(...subResult.skills);
      diagnostics.push(...subResult.diagnostics);
      continue;
    }

    // 仅根目录的直接 .md 文件作为 skill 加载（对齐参考实现）
    if (!includeRootFiles || !entry.endsWith(".md")) continue;
    if (ignoreMatcher.ignores(relativePath(rootDir, fullPath))) continue;
    const result = await loadSkillFromFile(fullPath);
    if (result.skill) skills.push(result.skill);
    diagnostics.push(...result.diagnostics);
  }

  return { skills, diagnostics };
}

/** 将 ignore 模式限定到指定目录前缀（相对 root） */
function prefixPattern(line: string, relPrefix: string): string | null {
  let pattern = line.trim();
  if (!pattern) return null;
  if (pattern.startsWith("#") && !pattern.startsWith("\\#")) return null;
  if (pattern.startsWith("\\#")) pattern = pattern.slice(1);

  let negated = false;
  if (pattern.startsWith("!")) {
    negated = true;
    pattern = pattern.slice(1);
  } else if (pattern.startsWith("\\!")) {
    pattern = pattern.slice(1);
  }
  if (!pattern) return null;
  if (pattern.startsWith("/")) pattern = pattern.slice(1);
  // 子目录 ignore 模式相对该目录生效
  const prefixed = relPrefix ? `${relPrefix}/${pattern}` : pattern;
  return negated ? `!${prefixed}` : prefixed;
}

/** 计算 path 相对 root 的路径（统一 / 分隔） */
function relativePath(root: string, path: string): string {
  const normRoot = root.replace(/\\/g, "/").replace(/\/+$/, "");
  const normPath = path.replace(/\\/g, "/").replace(/\/+$/, "");
  if (normPath === normRoot) return "";
  if (normPath.startsWith(`${normRoot}/`)) return normPath.slice(normRoot.length + 1);
  return normPath;
}

/**
 * 从一个或多个目录加载 skills
 *
 * 递归遍历目录，加载 SKILL.md 文件，解析 frontmatter；
 * 根目录的直接 .md 文件也会被加载；支持 .gitignore / .ignore / .fdignore。
 * 缺失的目录会被跳过。
 */
export async function loadSkills(
  dirs: string | string[],
): Promise<{ skills: Skill[]; diagnostics: SkillDiagnostic[] }> {
  const allSkills: Skill[] = [];
  const allDiagnostics: SkillDiagnostic[] = [];

  for (const dir of Array.isArray(dirs) ? dirs : [dirs]) {
    const resolvedDir = resolve(dir);
    if (!(await fileExists(resolvedDir))) {
      // 缺失目录不报错，静默跳过
      continue;
    }
    const result = await loadSkillsFromDir(resolvedDir, true, new IgnoreMatcher(), resolvedDir);
    allSkills.push(...result.skills);
    allDiagnostics.push(...result.diagnostics);
  }

  return { skills: allSkills, diagnostics: allDiagnostics };
}

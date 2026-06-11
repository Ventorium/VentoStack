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

async function loadSkillsFromDir(
  dir: string,
): Promise<{ skills: Skill[]; diagnostics: SkillDiagnostic[] }> {
  const skills: Skill[] = [];
  const diagnostics: SkillDiagnostic[] = [];

  if (!(await isDirectory(dir))) return { skills, diagnostics };

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
      const result = await loadSkillFromFile(fullPath);
      if (result.skill) skills.push(result.skill);
      diagnostics.push(...result.diagnostics);
      continue;
    }

    // 递归子目录
    if (await isDirectory(fullPath)) {
      // 跳过隐藏目录
      if (entry.startsWith(".")) continue;
      const subResult = await loadSkillsFromDir(fullPath);
      skills.push(...subResult.skills);
      diagnostics.push(...subResult.diagnostics);
    }
  }

  return { skills, diagnostics };
}

/**
 * 从一个或多个目录加载 skills
 *
 * 递归遍历目录，加载 SKILL.md 文件，解析 frontmatter。
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
    const result = await loadSkillsFromDir(resolvedDir);
    allSkills.push(...result.skills);
    allDiagnostics.push(...result.diagnostics);
  }

  return { skills: allSkills, diagnostics: allDiagnostics };
}

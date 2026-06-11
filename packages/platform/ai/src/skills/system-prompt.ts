/**
 * Skill → System Prompt 格式化
 *
 * 将已加载的 skills 以 XML 格式注入 system prompt，
 * 让模型知道有哪些 skill 可用以及何时使用。
 */
import type { Skill } from "./types";

/**
 * XML 转义
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * 将 skills 格式化为 system prompt 片段
 *
 * 隐藏 disableModelInvocation 的 skills。
 * 输出格式与 agentskills.io 规范兼容。
 */
export function formatSkillsForSystemPrompt(skills: Skill[]): string {
  const visibleSkills = skills.filter(
    (skill) => !skill.disableModelInvocation,
  );
  if (visibleSkills.length === 0) return "";

  const lines = [
    "The following skills provide specialized instructions for specific tasks.",
    "Read the full skill file when the task matches its description.",
    "When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.",
    "",
    "<available_skills>",
  ];

  for (const skill of visibleSkills) {
    lines.push("  <skill>");
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(
      `    <description>${escapeXml(skill.description)}</description>`,
    );
    lines.push(
      `    <location>${escapeXml(skill.filePath)}</location>`,
    );
    lines.push("  </skill>");
  }

  lines.push("</available_skills>");
  return lines.join("\n");
}

/**
 * 格式化单个 skill 调用提示（用于显式调用）
 */
export function formatSkillInvocation(
  skill: Skill,
  additionalInstructions?: string,
): string {
  const skillDir = skill.filePath.replace(/\/[^/]*$/, "");
  const skillBlock =
    `<skill name="${escapeXml(skill.name)}" location="${escapeXml(skill.filePath)}">\n` +
    `References are relative to ${skillDir}.\n\n` +
    `${skill.content}\n` +
    `</skill>`;
  return additionalInstructions
    ? `${skillBlock}\n\n${additionalInstructions}`
    : skillBlock;
}

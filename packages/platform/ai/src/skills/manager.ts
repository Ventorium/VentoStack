/**
 * Skill Manager — 管理 Skill 生命周期
 */
import { loadSkills } from "./loader";
import type { Skill, SkillDiagnostic, SkillManager } from "./types";

export interface SkillManagerConfig {
  /** skill 目录列表 */
  dirs: string[];
}

/**
 * 创建 SkillManager 实例
 */
export function createSkillManager(config: SkillManagerConfig): SkillManager {
  let skills: Skill[] = [];
  let diagnostics: SkillDiagnostic[] = [];

  function getSkills(): Skill[] {
    return [...skills];
  }

  function getSkill(name: string): Skill | undefined {
    return skills.find((s) => s.name === name);
  }

  async function reload(): Promise<{
    skills: Skill[];
    diagnostics: SkillDiagnostic[];
  }> {
    const result = await loadSkills(config.dirs);
    skills = result.skills;
    diagnostics = result.diagnostics;
    return result;
  }

  function addSkill(skill: Skill): void {
    const existing = skills.findIndex((s) => s.name === skill.name);
    if (existing >= 0) {
      skills[existing] = skill;
    } else {
      skills.push(skill);
    }
  }

  function removeSkill(name: string): boolean {
    const idx = skills.findIndex((s) => s.name === name);
    if (idx < 0) return false;
    skills.splice(idx, 1);
    return true;
  }

  function getDiagnostics(): SkillDiagnostic[] {
    return [...diagnostics];
  }

  return {
    getSkills,
    getSkill,
    reload,
    addSkill,
    removeSkill,
    getDiagnostics,
  };
}

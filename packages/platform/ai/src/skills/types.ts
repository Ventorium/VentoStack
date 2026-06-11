/**
 * Skill 系统类型定义
 *
 * 对齐参考实现的 Skill 接口，支持 SKILL.md 文件加载、
 * YAML frontmatter 解析、system prompt 注入。
 */

/** Skill 定义 */
export interface Skill {
  /** 稳定的 skill 名称，用于查找和模型可见列表 */
  name: string;
  /** 简短描述，告知模型何时使用此 skill */
  description: string;
  /** 完整的 skill 指令内容 */
  content: string;
  /** skill 文件绝对路径，用于解析相对引用 */
  filePath: string;
  /** 从模型可见列表中隐藏，但应用仍可手动调用 */
  disableModelInvocation?: boolean;
}

/** Skill 加载诊断 */
export interface SkillDiagnostic {
  type: "warning";
  code: SkillDiagnosticCode;
  message: string;
  path: string;
}

export type SkillDiagnosticCode =
  | "file_info_failed"
  | "read_failed"
  | "parse_failed"
  | "invalid_metadata"
  | "not_found";

/** Skill 资源管理器 */
export interface SkillManager {
  /** 获取所有已加载的 skills */
  getSkills(): Skill[];
  /** 获取指定名称的 skill */
  getSkill(name: string): Skill | undefined;
  /** 重新加载 skills */
  reload(): Promise<{ skills: Skill[]; diagnostics: SkillDiagnostic[] }>;
  /** 动态添加 skill */
  addSkill(skill: Skill): void;
  /** 移除 skill */
  removeSkill(name: string): boolean;
  /** 获取加载诊断信息 */
  getDiagnostics(): SkillDiagnostic[];
}

/**
 * Prompt Template 类型定义
 */

/** Prompt 模板 */
export interface PromptTemplate {
  /** 稳定的模板名称 */
  name: string;
  /** 模板描述 */
  description?: string;
  /** 模板内容（含参数占位符） */
  content: string;
  /** 源文件路径 */
  filePath?: string;
}

/** 加载诊断 */
export interface PromptTemplateDiagnostic {
  type: "warning";
  code: "read_failed" | "parse_failed";
  message: string;
  path: string;
}

/** Prompt Template 管理器 */
export interface PromptTemplateManager {
  /** 获取所有模板 */
  getTemplates(): PromptTemplate[];
  /** 按名称获取模板 */
  getTemplate(name: string): PromptTemplate | undefined;
  /** 格式化模板调用（替换参数） */
  formatInvocation(name: string, args?: string[]): string | null;
  /** 重新加载 */
  reload(): Promise<{
    templates: PromptTemplate[];
    diagnostics: PromptTemplateDiagnostic[];
  }>;
  /** 添加模板 */
  addTemplate(template: PromptTemplate): void;
  /** 移除模板 */
  removeTemplate(name: string): boolean;
}

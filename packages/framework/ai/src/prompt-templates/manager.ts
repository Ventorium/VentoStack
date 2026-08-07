/**
 * Prompt Template Manager
 */
import { loadPromptTemplates, formatPromptTemplateInvocation } from "./loader";
import type {
  PromptTemplate,
  PromptTemplateDiagnostic,
  PromptTemplateManager,
} from "./types";

export interface PromptTemplateManagerConfig {
  paths: string[];
}

export function createPromptTemplateManager(
  config: PromptTemplateManagerConfig,
): PromptTemplateManager {
  let templates: PromptTemplate[] = [];
  let diagnostics: PromptTemplateDiagnostic[] = [];

  function getTemplates(): PromptTemplate[] {
    return [...templates];
  }

  function getTemplate(name: string): PromptTemplate | undefined {
    return templates.find((t) => t.name === name);
  }

  function formatInvocation(name: string, args: string[] = []): string | null {
    const template = getTemplate(name);
    if (!template) return null;
    return formatPromptTemplateInvocation(template, args);
  }

  async function reload(): Promise<{
    templates: PromptTemplate[];
    diagnostics: PromptTemplateDiagnostic[];
  }> {
    const result = await loadPromptTemplates(config.paths);
    templates = result.templates;
    diagnostics = result.diagnostics;
    return result;
  }

  function addTemplate(template: PromptTemplate): void {
    const existing = templates.findIndex((t) => t.name === template.name);
    if (existing >= 0) {
      templates[existing] = template;
    } else {
      templates.push(template);
    }
  }

  function removeTemplate(name: string): boolean {
    const idx = templates.findIndex((t) => t.name === name);
    if (idx < 0) return false;
    templates.splice(idx, 1);
    return true;
  }

  return {
    getTemplates,
    getTemplate,
    formatInvocation,
    reload,
    addTemplate,
    removeTemplate,
  };
}

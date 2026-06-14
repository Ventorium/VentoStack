/**
 * Markdown 清洗引擎
 * 按优先级依次执行规则管道
 */
import type { CleanerRule, CleanerConfig, CleanerContext } from "../types";

import { unicodeRule } from "./rules/unicode";
import { whitespaceRule } from "./rules/whitespace";
import { htmlArtifactsRule } from "./rules/html-artifacts";
import { blankLinesRule } from "./rules/blank-lines";
import { headingsRule } from "./rules/headings";
import { listsRule } from "./rules/lists";
import { tablesRule } from "./rules/tables";
import { boilerplateRule } from "./rules/boilerplate";
import { duplicatesRule } from "./rules/duplicates";
import { linkCleanupRule } from "./rules/link-cleanup";

/** 所有内置规则（按优先级排序） */
const BUILTIN_RULES: CleanerRule[] = [
  unicodeRule,
  whitespaceRule,
  htmlArtifactsRule,
  blankLinesRule,
  headingsRule,
  listsRule,
  tablesRule,
  boilerplateRule,
  duplicatesRule,
  linkCleanupRule,
].sort((a, b) => a.priority - b.priority);

export interface MarkdownCleaner {
  clean(markdown: string, context: CleanerContext): string;
  addRule(rule: CleanerRule): void;
  listRules(): CleanerRule[];
}

export function createMarkdownCleaner(config?: CleanerConfig): MarkdownCleaner {
  const customRules: CleanerRule[] = [];

  function getActiveRules(): CleanerRule[] {
    const allRules = [...BUILTIN_RULES, ...customRules].sort((a, b) => a.priority - b.priority);
    const { enabledRules, disabledRules } = config ?? {};

    return allRules.filter((rule) => {
      if (enabledRules && enabledRules.length > 0) {
        return enabledRules.includes(rule.name);
      }
      if (disabledRules && disabledRules.includes(rule.name)) {
        return false;
      }
      return true;
    });
  }

  return {
    clean(markdown: string, context: CleanerContext): string {
      if (config?.enabled === false) return markdown;

      let result = markdown;
      for (const rule of getActiveRules()) {
        try {
          result = rule.clean(result, context);
        } catch {
          // 单条规则失败不应中断整个流程
        }
      }
      return result;
    },

    addRule(rule: CleanerRule): void {
      customRules.push(rule);
    },

    listRules(): CleanerRule[] {
      return getActiveRules();
    },
  };
}

// 导出所有规则供单独使用
export {
  unicodeRule,
  whitespaceRule,
  htmlArtifactsRule,
  blankLinesRule,
  headingsRule,
  listsRule,
  tablesRule,
  boilerplateRule,
  duplicatesRule,
  linkCleanupRule,
};

/**
 * 清洗规则：列表格式规范化
 * - 统一列表标记为 `-`
 * - 移除空列表项
 */
import type { CleanerRule, CleanerContext } from "../../types";

export const listsRule: CleanerRule = {
  name: "lists",
  description: "统一列表标记为 `- `，移除空列表项",
  priority: 70,

  clean(markdown: string, _ctx: CleanerContext): string {
    return markdown
      // 无序列表：* → -
      .replace(/^(\s*)\* /gm, "$1- ")
      // 无序列表：• → -
      .replace(/^(\s*)[•·] /gm, "$1- ")
      // 移除空列表项
      .replace(/^(\s*)[-*]\s*$/gm, "");
  },
};

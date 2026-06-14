/**
 * 清洗规则：去除多余空行
 * 连续 3+ 空行 → 最多 2 个
 */
import type { CleanerRule, CleanerContext } from "../../types";

export const blankLinesRule: CleanerRule = {
  name: "blank-lines",
  description: "去除多余空行，连续 3 个以上空行缩减为 2 个",
  priority: 50,

  clean(markdown: string, _ctx: CleanerContext): string {
    return markdown.replace(/\n{3,}/g, "\n\n");
  },
};

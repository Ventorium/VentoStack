/**
 * 清洗规则：链接清理
 * - 修复断裂的链接
 * - 移除空链接
 * - 移除无效的图片引用
 */
import type { CleanerRule, CleanerContext } from "../../types";

export const linkCleanupRule: CleanerRule = {
  name: "link-cleanup",
  description: "修复断裂链接，移除空链接和无效图片引用",
  priority: 110,

  clean(markdown: string, _ctx: CleanerContext): string {
    return markdown
      // 图片必须先处理（在链接之前）
      .replace(/!\[\s*\]\(\s*\)/g, "")                      // 空图片
      .replace(/!\[[^\]]*\]\(word\/media\/[^)]+\)/g, "")    // Word media 引用
      // 链接
      .replace(/\[([^\]]*)\]\(\s*\)/g, "$1")                // 空链接 → 保留文本
      // 修复重复的括号 [[text]] → [text]
      .replace(/\[\[([^\]]+)\]\](?!\()/g, "[$1]")
      // 移除孤立的 ](
      .replace(/\]\(\s*\)/g, "");
  },
};

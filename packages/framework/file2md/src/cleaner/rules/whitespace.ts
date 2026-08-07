/**
 * 清洗规则：空白字符规范化
 * - 行尾空白
 * - Tab → 空格
 * - 控制字符移除
 */
import type { CleanerRule, CleanerContext } from "../../types";

export const whitespaceRule: CleanerRule = {
  name: "whitespace",
  description: "移除行尾空白、控制字符，Tab 转空格",
  priority: 30,

  clean(markdown: string, _ctx: CleanerContext): string {
    return markdown
      // 移除控制字符（保留 \n \r \t）
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      // Tab → 2 空格
      .replace(/\t/g, "  ")
      // 行尾空白
      .replace(/[ \t]+$/gm, "");
  },
};

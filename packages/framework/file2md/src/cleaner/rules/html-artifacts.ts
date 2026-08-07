/**
 * 清洗规则：HTML 转换残留清理
 * - &nbsp; → 空格
 * - 空 <br/> 残留
 * - HTML 实体解码
 */
import type { CleanerRule, CleanerContext } from "../../types";

export const htmlArtifactsRule: CleanerRule = {
  name: "html-artifacts",
  description: "清理 HTML 转换残留（HTML 实体、空标签等）",
  priority: 40,

  clean(markdown: string, _ctx: CleanerContext): string {
    return markdown
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&[a-zA-Z]+;/g, "")
      // 空的 HTML 标签残留
      .replace(/<\/?(?:div|span|p|section|article)\b[^>]*>/gi, "")
      // 残留的 <br> 标签（已是 markdown 换行）
      .replace(/<br\s*\/?>/gi, "\n");
  },
};

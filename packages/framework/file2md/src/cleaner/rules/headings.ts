/**
 * 清洗规则：标题规范化
 * - 移除空标题
 * - 检测标题跳级
 */
import type { CleanerRule, CleanerContext } from "../../types";

export const headingsRule: CleanerRule = {
  name: "headings",
  description: "移除空标题，检测标题层级跳跃",
  priority: 60,

  clean(markdown: string, _ctx: CleanerContext): string {
    const lines = markdown.split("\n");
    const result: string[] = [];
    let prevLevel = 0;

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
      if (headingMatch) {
        const level = headingMatch[1]!.length;
        const text = headingMatch[2]!.trim();

        // 跳过空标题
        if (!text) continue;

        // 跳级警告（在内容中嵌入注释）
        if (level > prevLevel + 1 && prevLevel > 0) {
          result.push(`<!-- 标题层级跳跃: h${prevLevel} → h${level} -->`);
        }

        prevLevel = level;
      }
      result.push(line);
    }

    return result.join("\n");
  },
};

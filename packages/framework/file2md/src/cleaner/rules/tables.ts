/**
 * 清洗规则：表格格式清理
 * - 移除全空单元格行
 * - 保留分隔符行（| --- | --- |）
 */
import type { CleanerRule, CleanerContext } from "../../types";

export const tablesRule: CleanerRule = {
  name: "tables",
  description: "清理表格格式，移除全空单元格行",
  priority: 80,

  clean(markdown: string, _ctx: CleanerContext): string {
    const lines = markdown.split("\n");
    const result: string[] = [];

    for (const line of lines) {
      if (line.trim().startsWith("|")) {
        const cells = line.split("|").slice(1, -1);
        // 保留分隔符行（全是 ---）
        const allSeparators = cells.every((c) => /^[\s-]+$/.test(c) && c.replace(/\s/g, "").startsWith("-"));
        if (allSeparators) {
          result.push(line);
          continue;
        }
        // 移除全空单元格行
        const allEmpty = cells.every((c) => c.trim() === "");
        if (allEmpty) continue;
      }
      result.push(line);
    }

    return result.join("\n");
  },
};

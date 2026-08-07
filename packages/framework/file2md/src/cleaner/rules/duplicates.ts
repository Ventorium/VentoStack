/**
 * 清洗规则：重复内容检测
 * 检测连续重复的段落（常见于 PDF 解析结果）
 */
import type { CleanerRule, CleanerContext } from "../../types";

export const duplicatesRule: CleanerRule = {
  name: "duplicates",
  description: "检测并移除连续重复的段落",
  priority: 100,

  clean(markdown: string, _ctx: CleanerContext): string {
    // 按双换行分段
    const paragraphs = markdown.split(/\n\n+/);
    if (paragraphs.length <= 1) return markdown;

    const result: string[] = [];
    let lastContent = "";

    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) {
        result.push(para);
        continue;
      }

      // 跳过连续重复段落（相似度 > 80%）
      if (lastContent && trimmed === lastContent) {
        continue;
      }

      // 也检测高相似度（80%+ 字符相同）
      if (lastContent && lastContent.length > 50 && isSimilar(trimmed, lastContent, 0.8)) {
        continue;
      }

      result.push(para);
      lastContent = trimmed;
    }

    return result.join("\n\n");
  },
};

/**
 * 简单的文本相似度检测（基于字符重叠比例）
 */
function isSimilar(a: string, b: string, threshold: number): boolean {
  if (a === b) return true;
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;

  if (shorter.length === 0) return false;

  // 使用 n-gram (3字符) 进行快速比较
  const ngramSize = 3;
  const shorterNgrams = new Set<string>();
  for (let i = 0; i <= shorter.length - ngramSize; i++) {
    shorterNgrams.add(shorter.slice(i, i + ngramSize));
  }

  let matches = 0;
  let total = 0;
  for (let i = 0; i <= longer.length - ngramSize; i++) {
    total++;
    if (shorterNgrams.has(longer.slice(i, i + ngramSize))) {
      matches++;
    }
  }

  return total > 0 && matches / total >= threshold;
}

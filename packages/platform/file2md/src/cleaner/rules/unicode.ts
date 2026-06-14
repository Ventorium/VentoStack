/**
 * 清洗规则：Unicode 规范化
 * - NFC 规范化
 * - 全角 → 半角（数字和字母）
 * - 零宽字符移除
 */
import type { CleanerRule, CleanerContext } from "../../types";

export const unicodeRule: CleanerRule = {
  name: "unicode",
  description: "Unicode NFC 规范化，移除零宽字符，全角转半角",
  priority: 10,

  clean(markdown: string, _ctx: CleanerContext): string {
    let result = markdown;

    // NFC 规范化
    result = result.normalize("NFC");

    // 移除零宽字符
    result = result.replace(/[\u200B\u200C\u200D\uFEFF\u200E\u200F\u202A-\u202E\u2060-\u2064]/g, "");

    // 全角数字和字母 → 半角
    result = result.replace(/[\uFF10-\uFF19]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xFF10 + 0x30)
    );
    result = result.replace(/[\uFF21-\uFF3A]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xFF21 + 0x41)
    );
    result = result.replace(/[\uFF41-\uFF5A]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xFF41 + 0x61)
    );

    return result;
  },
};

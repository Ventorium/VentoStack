/**
 * 清洗规则：页眉页脚/水印/常见样板移除
 * 匹配并移除常见页眉页脚模式：
 * - "第X页/共X页"
 * - 页码格式 "1", "- 1 -", "Page 1"
 * - 版权声明
 * - "仅供xxx使用" 水印文字
 */
import type { CleanerRule, CleanerContext } from "../../types";

const BOILERPLATE_PATTERNS: RegExp[] = [
  // 页码 — 第X页/共X页（支持 / , ， 分隔符）
  /^\s*第\s*\d+\s*页\s*(?:\/|,|，)\s*共\s*\d+\s*页\s*$/gm,
  /^\s*[-—]\s*\d+\s*[-—]\s*$/gm,
  /^\s*Page\s+\d+\s*(?:of\s+\d+)?\s*$/gim,
  /^\s*\d+\s*\/\s*\d+\s*$/gm,

  // 版权声明
  /^(?:版权所有|Copyright|©)\s.*$/gim,
  /^(?:All\s+rights?\s+reserved).*$/gim,

  // 水印文字
  /^(?:仅供|内部资料|机密|Confidential|Internal\s+Use\s+Only).*$/gim,

  // Word/Office 默认页脚
  /^\s*(?:文件编号|版本号|编制日期|审核|批准)\s*[:：].*$/gm,
];

export const boilerplateRule: CleanerRule = {
  name: "boilerplate",
  description: "移除页眉页脚、页码、版权声明、水印文字等样板内容",
  priority: 90,

  clean(markdown: string, _ctx: CleanerContext): string {
    let result = markdown;
    for (const pattern of BOILERPLATE_PATTERNS) {
      pattern.lastIndex = 0;
      result = result.replace(pattern, "");
    }
    return result;
  },
};

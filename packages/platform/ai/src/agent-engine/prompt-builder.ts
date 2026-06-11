/**
 * 消息组装 + token 裁剪
 */
import type { ChatMessage } from "../llm-gateway/types";
import type { SearchResult } from "../knowledge-base/types";

export interface TokenBudget {
  maxPromptTokens: number;
  maxCompletionTokens: number;
  reservedForContext: number;
}

const DEFAULT_BUDGET: TokenBudget = {
  maxPromptTokens: 128000,
  maxCompletionTokens: 4096,
  reservedForContext: 4000,
};

/**
 * Token 估算（中文 1 字 ≈ 1.5 token，英文 4 字符 ≈ 1 token）
 */
export function estimateTokenCount(text: string): number {
  const chineseChars = (text.match(/[一-龥]/g) ?? []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars * 1.5 + otherChars / 4);
}

/**
 * 裁剪消息到 token 预算内
 */
export function fitMessagesToBudget(
  messages: ChatMessage[],
  systemPrompt: string,
  budget: Partial<TokenBudget> = {},
): ChatMessage[] {
  const { maxPromptTokens, maxCompletionTokens, reservedForContext } = {
    ...DEFAULT_BUDGET,
    ...budget,
  };

  const systemTokens = estimateTokenCount(systemPrompt);
  const availableTokens =
    maxPromptTokens - maxCompletionTokens - reservedForContext - systemTokens;

  if (availableTokens <= 0) {
    return messages.slice(-1); // 至少保留最后一条
  }

  // 从最新的消息开始，向前遍历
  let totalTokens = 0;
  const fitted: ChatMessage[] = [];

  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokenCount(messages[i].content);
    if (totalTokens + msgTokens > availableTokens) {
      if (fitted.length === 0) {
        // 至少保留最后一条（截断内容）
        const truncated = messages[i].content.slice(
          0,
          Math.floor(availableTokens * 2),
        );
        fitted.unshift({ ...messages[i], content: truncated + "...[已截断]" });
      }
      break;
    }
    fitted.unshift(messages[i]);
    totalTokens += msgTokens;
  }

  return fitted;
}

/**
 * 格式化知识库搜索结果为上下文
 * 使用 XML 标签包裹，明确区分系统指令和不可信内容
 */
export function formatKBContext(results: SearchResult[]): string {
  if (results.length === 0) return "";

  const parts = results.map(
    (r, i) =>
      `<retrieved_context source="${r.path}" score="${r.score.toFixed(2)}">\n` +
      `## ${r.title}\n\n${r.excerpt}\n` +
      `</retrieved_context>`,
  );

  return `以下是知识库中的相关文件：\n\n${parts.join("\n\n")}`;
}

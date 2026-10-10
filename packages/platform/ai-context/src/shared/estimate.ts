/**
 * Token 估算（参考 dsh-context/src/shared/estimate.ts — 固定密度启发式）
 *
 * 与 DeepSeek Harness 自身 token-meter 使用完全一致的估算规则：
 *  ~4 字符 ≈ 1 token，+4 角色帧开销（ROLE_OVERHEAD）。文本块以字符数计，
 * 非文本块退化到 JSON 字符串长度。用于上下文构成、费用估算和 KPI 显示——
 * 估算值与提供方上报实际值（ActualUsage）并列展示，不混合计算，
 * 保持与参考实现的低级别一致性（compat/§docs/compatibility.md）。
 */

export const CHARS_PER_TOKEN = 4;
export const ROLE_OVERHEAD = 4;

/** 系统提示文本的估算（空/非字符串 = 0） */
export function estimateSystemTokens(text: unknown): number {
  if (typeof text !== "string" || text.length === 0) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN) + ROLE_OVERHEAD;
}

/** 系统提示内容块的估算（每个 text 块按字符数计，其余退化到 JSON 长度） */
export function estimateSystemContent(blocks: unknown): number {
  if (!Array.isArray(blocks) || blocks.length === 0) return 0;
  let characters = 0;
  for (const block of blocks) {
    const text =
      block !== null &&
      typeof block === "object" &&
      (block as { type?: unknown }).type === "text"
        ? (block as { text?: unknown }).text
        : undefined;
    if (typeof text === "string") {
      characters += text.length;
      continue;
    }
    try {
      const json: unknown = JSON.stringify(block);
      if (typeof json === "string") characters += json.length;
    } catch {
      // 周期性/恶意块不抛异常，而是计为 0（与参考实现一致）
    }
  }
  return Math.ceil(characters / CHARS_PER_TOKEN) + ROLE_OVERHEAD;
}

/** 任意字符串的通用估算（用于消息、工具结果、文件内容预览等） */
export function estimateStringTokens(text: unknown): number {
  if (typeof text !== "string" || text.length === 0) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN) + ROLE_OVERHEAD;
}

/** 上下文构成（Composition）的各分桶估算合计（用于当前 snapshot） */
export function estimateComposition(
  system: number,
  tools: number,
  user: number,
  inject: number,
  skill: number,
  assistant: number,
  tool: number,
): { total: number; categories: Record<string, number> } {
  const categories = {
    system,
    tools,
    user,
    inject,
    skill,
    assistant,
    tool,
  };
  const total =
    system +
    tools +
    user +
    inject +
    skill +
    assistant +
    tool;
  return { total, categories };
}

/**
 * 上下文压缩系统
 *
 * 对齐参考实现的 compaction：
 * - 分析 session tree 找到最佳切割点
 * - 调用 LLM 生成摘要
 * - 文件操作追踪
 * - 拆分 turn 处理
 */
import type { LLMGateway, ChatMessage } from "../llm-gateway/types";
import type { SessionTreeEntry, MessageEntry, CompactionEntry } from "../session/types";

// ---- 类型 ----

export interface CompactionSettings {
  /** 启用自动压缩 */
  enabled: boolean;
  /** 摘要 prompt + output 预留 tokens */
  reserveTokens: number;
  /** 压缩后保留的最近上下文 tokens */
  keepRecentTokens: number;
}

export const DEFAULT_COMPACTION_SETTINGS: CompactionSettings = {
  enabled: true,
  reserveTokens: 16384,
  keepRecentTokens: 20000,
};

export interface CompactionResult {
  /** 摘要文本 */
  summary: string;
  /** 保留历史的起始 entry ID */
  firstKeptEntryId: string;
  /** 压缩前的 token 数 */
  tokensBefore: number;
  /** 文件操作详情 */
  details?: { readFiles: string[]; modifiedFiles: string[] };
}

export interface CompactionPreparation {
  firstKeptEntryId: string;
  messagesToSummarize: Array<MessageEntry["message"]>;
  tokensBefore: number;
  previousSummary?: string;
  settings: CompactionSettings;
}

// ---- Token 估算 ----

export function estimateTokenCount(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars * 1.5 + otherChars / 4);
}

/** 与 pi-agent 一致：仅在上下文超过模型窗口减去摘要预留量后自动压缩。 */
export function shouldCompact(
  contextTokens: number,
  contextWindow: number,
  settings: CompactionSettings,
): boolean {
  if (!settings.enabled) return false;
  return contextTokens > Math.max(0, contextWindow - settings.reserveTokens);
}

export function estimateSessionContextTokens(entries: SessionTreeEntry[]): number {
  let tokens = 0;
  for (const entry of entries) {
    if (entry.type === "message") tokens += estimateMessageTokens(entry.message);
    if (entry.type === "compaction") tokens += estimateTokenCount(entry.summary) + 4;
  }
  return tokens;
}

function estimateMessageTokens(msg: MessageEntry["message"]): number {
  return estimateTokenCount(msg.content) + 4; // role + formatting overhead
}

// ---- 序列化 ----

function serializeMessage(msg: MessageEntry["message"]): string {
  const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
  let text = `[${role}]\n${msg.content}`;
  if (msg.toolCalls?.length) {
    text += `\n[Tool Calls: ${msg.toolCalls.map((tc) => tc.name).join(", ")}]`;
  }
  return text;
}

function serializeMessages(messages: MessageEntry["message"][]): string {
  return messages.map(serializeMessage).join("\n\n");
}

// ---- 切割点计算 ----

interface CutPoint {
  firstKeptEntryIndex: number;
  firstKeptEntryId: string;
  tokensBefore: number;
}

function findCutPoint(
  entries: SessionTreeEntry[],
  settings: CompactionSettings,
): CutPoint | null {
  // 计算总 token 数
  let totalTokens = 0;
  const messageEntries: Array<{ entry: SessionTreeEntry; entryIndex: number; tokens: number }> = [];

  for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
    const entry = entries[entryIndex]!;
    if (entry.type === "message") {
      const tokens = estimateMessageTokens(entry.message);
      messageEntries.push({ entry, entryIndex, tokens });
      totalTokens += tokens;
    } else if (entry.type === "compaction") {
      const tokens = estimateTokenCount(entry.summary) + 4;
      messageEntries.push({ entry, entryIndex, tokens });
      totalTokens += tokens;
    }
  }

  // 不需要压缩
  const budget = settings.keepRecentTokens + settings.reserveTokens;
  if (totalTokens <= budget) return null;

  // 从后往前找到保留点
  let keepTokens = 0;
  let cutIndex = 0;
  for (let i = messageEntries.length - 1; i >= 0; i--) {
    keepTokens += messageEntries[i]!.tokens;
    if (keepTokens >= settings.keepRecentTokens) {
      cutIndex = i;
      break;
    }
  }

  // 确保至少压缩 30%
  const minCutIndex = Math.floor(messageEntries.length * 0.3);
  cutIndex = Math.max(cutIndex, minCutIndex);
  cutIndex = Math.min(cutIndex, messageEntries.length - 1);

  const firstKeptEntry = messageEntries[cutIndex];
  if (!firstKeptEntry) return null;

  return {
    firstKeptEntryIndex: firstKeptEntry.entryIndex,
    firstKeptEntryId: firstKeptEntry.entry.id,
    tokensBefore: totalTokens,
  };
}

// ---- 摘要生成 ----

const SUMMARIZATION_SYSTEM_PROMPT = `You are a conversation summarizer. Create a concise but complete summary of the conversation history.

Include:
- Key decisions made
- Files read or modified (with paths)
- Important context for continuing the work
- Any errors or issues encountered

Be concise. Focus on actionable information.`;

async function generateSummary(
  messages: MessageEntry["message"][],
  gateway: LLMGateway,
  model: string,
  reserveTokens: number,
  signal?: AbortSignal,
  customInstructions?: string,
  previousSummary?: string,
): Promise<string> {
  const conversationText = serializeMessages(messages);
  let promptText = `<conversation>\n${conversationText}\n</conversation>\n\nSummarize the above conversation. Focus on key decisions, file operations, and context needed for continuation.`;

  if (previousSummary) {
    promptText = `<previous_summary>\n${previousSummary}\n</previous_summary>\n\n${promptText}`;
  }

  if (customInstructions) {
    promptText += `\n\nAdditional instructions: ${customInstructions}`;
  }

  const summaryMessages: ChatMessage[] = [
    { role: "system", content: SUMMARIZATION_SYSTEM_PROMPT },
    { role: "user", content: promptText },
  ];

  const result = await gateway.chat({
    model,
    messages: summaryMessages,
    maxTokens: Math.floor(reserveTokens / 2),
    ...(signal ? { signal } : {}),
  });
  if (!result.content.trim()) throw new Error("Compaction summary was empty");
  return result.content;
}

// ---- 主压缩函数 ----

export function prepareCompaction(
  entries: SessionTreeEntry[],
  settings: CompactionSettings,
): CompactionPreparation | null {
  if (entries.length === 0 || entries.at(-1)?.type === "compaction") return null;
  const cutPoint = findCutPoint(entries, settings);
  if (!cutPoint) return null;

  // 找到前一个 compaction
  let previousSummary: string | undefined;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i]!.type === "compaction") {
      previousSummary = (entries[i] as CompactionEntry).summary;
    }
  }

  // 收集需要压缩的消息
  const messagesToSummarize: Array<MessageEntry["message"]> = [];
  for (let i = 0; i < cutPoint.firstKeptEntryIndex; i++) {
    const entry = entries[i]!;
    if (entry.type === "message") {
      messagesToSummarize.push(entry.message);
    }
  }

  return {
    firstKeptEntryId: cutPoint.firstKeptEntryId,
    messagesToSummarize,
    tokensBefore: cutPoint.tokensBefore,
    ...(previousSummary === undefined ? {} : { previousSummary }),
    settings,
  };
}

export async function compact(
  preparation: CompactionPreparation,
  gateway: LLMGateway,
  model: string,
  signal?: AbortSignal,
  customInstructions?: string,
): Promise<CompactionResult> {
  const summary = await generateSummary(
    preparation.messagesToSummarize,
    gateway,
    model,
    preparation.settings.reserveTokens,
    signal,
    customInstructions,
    preparation.previousSummary,
  );

  return {
    summary,
    firstKeptEntryId: preparation.firstKeptEntryId,
    tokensBefore: preparation.tokensBefore,
  };
}

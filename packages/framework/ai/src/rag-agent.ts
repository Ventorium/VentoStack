/**
 * @ventostack/ai — RAG 智能体执行器
 *
 * 将检索（KnowledgeBase.search）、LLM 生成（LLMClient.chat）
 * 和上下文管理（ContextManager）编排为可调用智能体。
 */

import type { ContextManager } from "./context";
import type { ChatMessage, LLMClient } from "./llm";
import type { KnowledgeBase, SearchResult } from "./rag";
import type { Sandbox } from "./sandbox";
import type { ToolRegistry } from "./tool-registry";

/** RAG 智能体配置 */
export interface RAGAgentConfig {
  /** 智能体名称 */
  name: string;
  /** 系统提示词 */
  systemPrompt: string;
  /** 检索结果数量（topK），默认 5 */
  topK?: number;
  /** 最大历史消息数，默认 20 */
  maxHistory?: number;
  /** 用户输入最大长度，默认 4000 */
  maxInputLength?: number;
}

/** RAG 智能体依赖 */
export interface RAGAgentDeps {
  /** 知识库实例 */
  knowledgeBase: KnowledgeBase;
  /** 上下文管理器实例 */
  contextManager: ContextManager;
  /** LLM 客户端实例 */
  llmClient: LLMClient;
  /** 可选的工具注册表 */
  toolRegistry?: ToolRegistry;
  /** 可选的沙箱 */
  sandbox?: Sandbox;
}

/** 检索来源 */
export interface RAGSource {
  /** 文档 ID */
  id: string;
  /** 相似度得分 */
  score: number;
  /** 文档标题 */
  title: string;
  /** 内容摘要（前 200 字符） */
  excerpt: string;
}

/** RAG 对话结果 */
export interface RAGChatResult {
  /** 生成回答 */
  answer: string;
  /** 检索来源列表 */
  sources: RAGSource[];
  /** 对话 ID */
  conversationId: string;
}

/** RAG 智能体 */
export interface RAGAgent {
  /** 智能体名称 */
  readonly name: string;
  /** 系统提示词 */
  readonly systemPrompt: string;
  /**
   * 发起对话
   * @param message - 用户消息
   * @param conversationId - 可选的对话 ID（首次对话不传）
   * @returns 对话结果
   */
  chat(message: string, conversationId?: string): Promise<RAGChatResult>;
}

/** 默认 topK */
const DEFAULT_TOP_K = 5;
/** 默认最大历史消息数 */
const DEFAULT_MAX_HISTORY = 20;
/** 默认最大输入长度 */
const DEFAULT_MAX_INPUT_LENGTH = 4000;

/**
 * 格式化检索结果为上下文文本
 * @param results - 检索结果
 * @returns 拼接后的上下文文本
 */
function formatRetrievedContext(results: SearchResult[]): string {
  if (results.length === 0) {
    return "未找到相关文档。";
  }

  const parts: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    const title = (r.document.metadata?.title as string) ?? "未命名文档";
    parts.push(`[${i + 1}] ${title}\n${r.document.content}`);
  }

  return parts.join("\n\n");
}

/**
 * 提取来源信息
 * @param results - 检索结果
 * @returns 来源列表
 */
function extractSources(results: SearchResult[]): RAGSource[] {
  return results.map((r) => ({
    id: r.document.id,
    score: r.score,
    title: String(r.document.metadata?.title ?? "未命名文档"),
    excerpt: r.document.content.slice(0, 200),
  }));
}

/**
 * 组装对话消息列表
 * @param systemPrompt - 系统提示词
 * @param context - 检索上下文
 * @param history - 历史消息
 * @param userMessage - 用户消息
 * @returns 消息列表
 */
function buildMessages(
  systemPrompt: string,
  context: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  userMessage: string,
): ChatMessage[] {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        systemPrompt +
        "\n\n基于以下文档片段回答用户问题。如果文档中没有相关信息，请明确告知用户，不要编造信息。",
    },
  ];

  // 添加上下文
  messages.push({
    role: "user",
    content: `以下是与用户问题相关的文档片段：\n\n${context}\n\n请基于以上文档回答后续问题。`,
  });
  messages.push({
    role: "assistant",
    content: "好的，我会基于提供的文档片段回答问题。",
  });

  // 添加历史对话
  for (const h of history) {
    messages.push({ role: h.role, content: h.content });
  }

  // 添加当前用户问题
  messages.push({ role: "user", content: userMessage });

  return messages;
}

/**
 * 创建 RAG 智能体实例
 * @param deps - 依赖组件
 * @param config - 智能体配置
 * @returns RAGAgent 实例
 */
export function createRAGAgent(deps: RAGAgentDeps, config: RAGAgentConfig): RAGAgent {
  const { knowledgeBase, contextManager, llmClient } = deps;
  const {
    name,
    systemPrompt,
    topK = DEFAULT_TOP_K,
    maxHistory = DEFAULT_MAX_HISTORY,
    maxInputLength = DEFAULT_MAX_INPUT_LENGTH,
  } = config;

  // 校验参数
  if (topK < 1 || topK > 20) {
    throw new Error(`topK must be between 1 and 20, got ${topK}`);
  }
  if (maxInputLength < 1) {
    throw new Error(`maxInputLength must be >= 1, got ${maxInputLength}`);
  }

  async function chat(message: string, conversationId?: string): Promise<RAGChatResult> {
    // 输入长度限制
    const truncatedMessage =
      message.length > maxInputLength ? message.slice(0, maxInputLength) + "..." : message;

    // 获取或创建对话上下文
    let convId: string;
    if (conversationId) {
      const ctx = contextManager.get(conversationId);
      convId = ctx ? ctx.conversationId : contextManager.create(systemPrompt).conversationId;
    } else {
      convId = contextManager.create(systemPrompt).conversationId;
    }

    // 记录用户消息
    contextManager.addMessage(convId, "user", truncatedMessage);

    // 检索相关知识
    const searchResults = knowledgeBase.search(truncatedMessage, topK);
    const retrievedContext = formatRetrievedContext(searchResults);
    const sources = extractSources(searchResults);

    // 获取历史消息（排除 system/tool 消息）
    const allHistory = contextManager.getHistory(convId, maxHistory);
    const history = allHistory
      .filter(
        (m): m is typeof m & { role: "user" | "assistant" } =>
          m.role === "user" || m.role === "assistant",
      )
      .map((m) => ({ role: m.role, content: m.content }));

    // 组装消息并调用 LLM
    const messages = buildMessages(systemPrompt, retrievedContext, history, truncatedMessage);

    try {
      const answer = await llmClient.chat(messages);

      // 记录助手回答
      contextManager.addMessage(convId, "assistant", answer);

      return { answer, sources, conversationId: convId };
    } catch (err) {
      // LLM 调用失败时的降级处理
      const errorMsg = err instanceof Error ? err.message : String(err);
      const fallbackAnswer =
        sources.length > 0
          ? `检索到相关文档，但生成回答时出错：${errorMsg}`
          : `未找到相关文档，且生成回答时出错：${errorMsg}`;

      contextManager.addMessage(convId, "assistant", fallbackAnswer);

      return { answer: fallbackAnswer, sources, conversationId: convId };
    }
  }

  return {
    get name() {
      return name;
    },
    get systemPrompt() {
      return systemPrompt;
    },
    chat,
  };
}

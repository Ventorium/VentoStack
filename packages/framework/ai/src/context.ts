/**
 * @ventostack/ai — 上下文管理
 *
 * 提供对话上下文的创建、查询、消息追加、元数据管理和截断能力。
 * 所有数据保存在内存中，适用于单实例部署；多实例场景需外接存储。
 */

/** 对话消息 */
export interface ConversationMessage {
  /** 消息角色 */
  role: "system" | "user" | "assistant" | "tool";
  /** 消息内容 */
  content: string;
  /** 关联的工具调用 ID */
  toolCallId?: string;
  /** 消息时间戳（毫秒） */
  timestamp: number;
}

/** 对话上下文 */
export interface ConversationContext {
  /** 对话唯一标识 */
  conversationId: string;
  /** 消息列表 */
  messages: ConversationMessage[];
  /** 自定义元数据 */
  metadata: Record<string, unknown>;
  /** 创建时间（毫秒时间戳） */
  createdAt: number;
  /** 更新时间（毫秒时间戳） */
  updatedAt: number;
}

/** 上下文管理器，负责创建、查询和维护对话上下文 */
export interface ContextManager {
  /**
   * 创建新的对话上下文
   * @param systemPrompt - 可选的系统提示词
   * @returns 新创建的对话上下文
   */
  create(systemPrompt?: string): ConversationContext;

  /**
   * 获取指定对话上下文
   * @param conversationId - 对话 ID
   * @returns 对话上下文，不存在时返回 null
   */
  get(conversationId: string): ConversationContext | null;

  /**
   * 向指定对话添加消息
   * @param conversationId - 对话 ID
   * @param role - 消息角色
   * @param content - 消息内容
   * @param toolCallId - 可选的工具调用 ID
   * @returns 添加成功的消息，对话不存在时返回 null
   */
  addMessage(
    conversationId: string,
    role: "user" | "assistant" | "tool",
    content: string,
    toolCallId?: string,
  ): ConversationMessage | null;

  /**
   * 获取指定对话的历史消息
   * @param conversationId - 对话 ID
   * @param limit - 可选的最大返回条数，从最新消息开始截取
   * @returns 历史消息数组
   */
  getHistory(conversationId: string, limit?: number): ConversationMessage[];

  /**
   * 设置对话元数据
   * @param conversationId - 对话 ID
   * @param key - 元数据键
   * @param value - 元数据值
   * @returns 设置成功返回 true，对话不存在返回 false
   */
  setMetadata(conversationId: string, key: string, value: unknown): boolean;

  /**
   * 销毁指定对话上下文
   * @param conversationId - 对话 ID
   * @returns 销毁成功返回 true
   */
  destroy(conversationId: string): boolean;

  /**
   * 列出所有活跃的对话 ID
   * @returns 对话 ID 数组
   */
  listActive(): string[];

  /**
   * 截断对话消息，只保留最近 N 条
   * @param conversationId - 对话 ID
   * @param maxMessages - 保留的最大消息数
   * @returns 被移除的消息数量
   */
  truncate(conversationId: string, maxMessages: number): number;
}

/**
 * 创建上下文管理器实例
 * @returns ContextManager 实例
 */
export function createContextManager(): ContextManager {
  const contexts = new Map<string, ConversationContext>();

  function create(systemPrompt?: string): ConversationContext {
    const now = Date.now();
    const ctx: ConversationContext = {
      conversationId: crypto.randomUUID(),
      messages: [],
      metadata: {},
      createdAt: now,
      updatedAt: now,
    };

    if (systemPrompt !== undefined) {
      ctx.messages.push({
        role: "system",
        content: systemPrompt,
        timestamp: now,
      });
    }

    contexts.set(ctx.conversationId, ctx);
    return ctx;
  }

  function get(conversationId: string): ConversationContext | null {
    return contexts.get(conversationId) ?? null;
  }

  function addMessage(
    conversationId: string,
    role: "user" | "assistant" | "tool",
    content: string,
    toolCallId?: string,
  ): ConversationMessage | null {
    const ctx = contexts.get(conversationId);
    if (!ctx) {
      return null;
    }

    const msg: ConversationMessage = {
      role,
      content,
      timestamp: Date.now(),
    };

    if (toolCallId !== undefined) {
      msg.toolCallId = toolCallId;
    }

    ctx.messages.push(msg);
    ctx.updatedAt = Date.now();
    return msg;
  }

  function getHistory(conversationId: string, limit?: number): ConversationMessage[] {
    const ctx = contexts.get(conversationId);
    if (!ctx) {
      return [];
    }
    if (limit === undefined) {
      return [...ctx.messages];
    }
    return ctx.messages.slice(-limit);
  }

  function setMetadata(conversationId: string, key: string, value: unknown): boolean {
    const ctx = contexts.get(conversationId);
    if (!ctx) {
      return false;
    }
    ctx.metadata[key] = value;
    ctx.updatedAt = Date.now();
    return true;
  }

  function destroy(conversationId: string): boolean {
    return contexts.delete(conversationId);
  }

  function listActive(): string[] {
    return Array.from(contexts.keys());
  }

  function truncate(conversationId: string, maxMessages: number): number {
    const ctx = contexts.get(conversationId);
    if (!ctx) {
      return 0;
    }
    if (ctx.messages.length <= maxMessages) {
      return 0;
    }
    const removed = ctx.messages.length - maxMessages;
    ctx.messages = ctx.messages.slice(-maxMessages);
    ctx.updatedAt = Date.now();
    return removed;
  }

  return {
    create,
    get,
    addMessage,
    getHistory,
    setMetadata,
    destroy,
    listActive,
    truncate,
  };
}

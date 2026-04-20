// Context - AI 上下文管理

export interface ConversationMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  timestamp: number;
}

export interface ConversationContext {
  conversationId: string;
  messages: ConversationMessage[];
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface ContextManager {
  create(systemPrompt?: string): ConversationContext;
  get(conversationId: string): ConversationContext | null;
  addMessage(
    conversationId: string,
    role: "user" | "assistant" | "tool",
    content: string,
    toolCallId?: string,
  ): ConversationMessage | null;
  getHistory(conversationId: string, limit?: number): ConversationMessage[];
  setMetadata(conversationId: string, key: string, value: unknown): boolean;
  destroy(conversationId: string): boolean;
  listActive(): string[];
  truncate(conversationId: string, maxMessages: number): number;
}

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

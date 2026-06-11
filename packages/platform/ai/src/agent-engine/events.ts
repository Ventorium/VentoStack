/**
 * Agent 生命周期事件系统
 *
 * 对齐参考实现的 AgentEvent 联合类型，支持：
 * - Agent 生命周期 (agent_start / agent_end)
 * - Turn 生命周期 (turn_start / turn_end)
 * - 消息生命周期 (message_start / message_update / message_end)
 * - 工具执行生命周期 (tool_execution_start / tool_execution_update / tool_execution_end)
 * - Harness 扩展事件 (context / before_provider_request / abort / settled 等)
 */

// ---- 事件类型 ----

export interface AgentStartEvent {
  type: "agent_start";
}

export interface AgentEndEvent {
  type: "agent_end";
  messages: AgentEventMessage[];
}

export interface TurnStartEvent {
  type: "turn_start";
}

export interface TurnEndEvent {
  type: "turn_end";
  message: AgentEventMessage;
  toolResults: AgentToolResultEventMessage[];
}

export interface MessageStartEvent {
  type: "message_start";
  message: AgentEventMessage;
}

export interface MessageUpdateEvent {
  type: "message_update";
  message: AgentEventMessage;
  /** 增量更新内容 */
  delta?: string;
}

export interface MessageEndEvent {
  type: "message_end";
  message: AgentEventMessage;
}

export interface ToolExecutionStartEvent {
  type: "tool_execution_start";
  toolCallId: string;
  toolName: string;
  args: unknown;
}

export interface ToolExecutionUpdateEvent {
  type: "tool_execution_update";
  toolCallId: string;
  toolName: string;
  args: unknown;
  partialResult: unknown;
}

export interface ToolExecutionEndEvent {
  type: "tool_execution_end";
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError: boolean;
}

// Harness 扩展事件
export interface ContextEvent {
  type: "context";
  messages: AgentEventMessage[];
  systemPrompt: string;
}

export interface BeforeProviderRequestEvent {
  type: "before_provider_request";
  model: string;
  messageCount: number;
}

export interface AbortEvent {
  type: "abort";
  clearedMessages: AgentEventMessage[];
}

export interface SettledEvent {
  type: "settled";
}

export interface ErrorEvent {
  type: "error";
  error: { code: string; message: string; recoverable: boolean };
}

/** 所有事件的联合类型 */
export type AgentEvent =
  | AgentStartEvent
  | AgentEndEvent
  | TurnStartEvent
  | TurnEndEvent
  | MessageStartEvent
  | MessageUpdateEvent
  | MessageEndEvent
  | ToolExecutionStartEvent
  | ToolExecutionUpdateEvent
  | ToolExecutionEndEvent
  | ContextEvent
  | BeforeProviderRequestEvent
  | AbortEvent
  | SettledEvent
  | ErrorEvent;

// ---- 消息类型（事件载体） ----

export interface AgentEventMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model?: string;
  provider?: string;
  stopReason?: "stop" | "tool_calls" | "length" | "error" | "aborted";
  errorMessage?: string;
  timestamp: number;
}

export interface AgentToolResultEventMessage {
  toolCallId: string;
  toolName: string;
  content: string;
  isError: boolean;
  timestamp: number;
}

// ---- 事件发射器 ----

export type AgentEventHandler = (
  event: AgentEvent,
  signal?: AbortSignal,
) => Promise<void> | void;

/** Agent 事件发射器 */
export interface AgentEventEmitter {
  /** 注册事件监听器（"*" 匹配所有事件） */
  on(handler: AgentEventHandler): () => void;
  /** 按类型注册事件监听器 */
  onType<T extends AgentEvent["type"]>(
    type: T,
    handler: (
      event: Extract<AgentEvent, { type: T }>,
      signal?: AbortSignal,
    ) => Promise<void> | void,
  ): () => void;
  /** 发射事件 */
  emit(event: AgentEvent, signal?: AbortSignal): Promise<void>;
  /** 清除所有监听器 */
  clear(): void;
}

export function createEventEmitter(): AgentEventEmitter {
  const wildcardHandlers = new Set<AgentEventHandler>();
  const typedHandlers = new Map<string, Set<AgentEventHandler>>();

  function on(handler: AgentEventHandler): () => void {
    wildcardHandlers.add(handler);
    return () => {
      wildcardHandlers.delete(handler);
    };
  }

  function onType(
    type: string,
    handler: AgentEventHandler,
  ): () => void {
    let handlers = typedHandlers.get(type);
    if (!handlers) {
      handlers = new Set();
      typedHandlers.set(type, handlers);
    }
    handlers.add(handler);
    return () => {
      handlers!.delete(handler);
    };
  }

  async function emit(
    event: AgentEvent,
    signal?: AbortSignal,
  ): Promise<void> {
    // 通配符监听器
    for (const handler of wildcardHandlers) {
      if (signal?.aborted) break;
      await handler(event, signal);
    }
    // 类型监听器
    const typed = typedHandlers.get(event.type);
    if (typed) {
      for (const handler of typed) {
        if (signal?.aborted) break;
        await handler(event, signal);
      }
    }
  }

  function clear(): void {
    wildcardHandlers.clear();
    typedHandlers.clear();
  }

  return { on, onType, emit, clear };
}

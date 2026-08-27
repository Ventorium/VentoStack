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

// ---- 运行上下文 ----

/**
 * 事件所属的 Agent 运行上下文。
 * 由 runStream 内部的 emit 包装统一注入，用于并发运行时的事件路由
 * （链路追踪、审计等订阅方据此关联 run，不注入则为 undefined）。
 */
export interface AgentRunContext {
  runId: string;
  parentRunId?: string;
  sessionId?: string;
  agentId?: string;
  userId?: string;
  tenantId?: string;
}

/** agent_start 附带的运行元数据（解析后的运行配置快照） */
export interface AgentRunMeta {
  model?: string;
  maxIterations?: number;
  researchMode?: boolean;
  /** 触发本次运行的用户消息（截断保护） */
  userMessage?: string;
  skillIds?: string[];
  knowledgeBaseIds?: string[];
  mcpServerIds?: string[];
  toolNames?: string[];
}

// ---- 事件类型 ----

export interface AgentStartEvent {
  type: "agent_start";
  run?: AgentRunContext;
  meta?: AgentRunMeta;
}

export interface AgentEndEvent {
  type: "agent_end";
  run?: AgentRunContext;
  messages: AgentEventMessage[];
}

export interface TurnStartEvent {
  type: "turn_start";
  run?: AgentRunContext;
}

export interface TurnEndEvent {
  type: "turn_end";
  run?: AgentRunContext;
  message: AgentEventMessage;
  toolResults: AgentToolResultEventMessage[];
}

export interface MessageStartEvent {
  type: "message_start";
  run?: AgentRunContext;
  message: AgentEventMessage;
}

export interface MessageUpdateEvent {
  type: "message_update";
  run?: AgentRunContext;
  message: AgentEventMessage;
  /** 增量更新内容 */
  delta?: string;
}

export interface MessageEndEvent {
  type: "message_end";
  run?: AgentRunContext;
  message: AgentEventMessage;
}

export interface ToolExecutionStartEvent {
  type: "tool_execution_start";
  run?: AgentRunContext;
  toolCallId: string;
  toolName: string;
  args: unknown;
}

export interface ToolExecutionUpdateEvent {
  type: "tool_execution_update";
  run?: AgentRunContext;
  toolCallId: string;
  toolName: string;
  args: unknown;
  partialResult: unknown;
}

export interface ToolExecutionEndEvent {
  type: "tool_execution_end";
  run?: AgentRunContext;
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError: boolean;
}

// Harness 扩展事件
export interface ContextEvent {
  type: "context";
  run?: AgentRunContext;
  messages: AgentEventMessage[];
  systemPrompt: string;
}

export interface BeforeProviderRequestEvent {
  type: "before_provider_request";
  run?: AgentRunContext;
  model: string;
  messageCount: number;
}

/** 工具结果引入了新工具，已注册到运行时工具集（对齐参考实现 addedToolNames） */
export interface ToolsAddedEvent {
  type: "tools_added";
  run?: AgentRunContext;
  toolNames: string[];
  previousToolNames: string[];
}

export interface AbortEvent {
  type: "abort";
  run?: AgentRunContext;
  clearedMessages: AgentEventMessage[];
}

export interface SettledEvent {
  type: "settled";
  run?: AgentRunContext;
}

export interface ErrorEvent {
  type: "error";
  run?: AgentRunContext;
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
  | ToolsAddedEvent
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
  /** 该工具结果引入的新工具名（对齐参考实现 addedToolNames） */
  addedToolNames?: string[];
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

  function onType<T extends AgentEvent["type"]>(
    type: T,
    handler: (
      event: Extract<AgentEvent, { type: T }>,
      signal?: AbortSignal,
    ) => Promise<void> | void,
  ): () => void {
    const erasedHandler: AgentEventHandler = (event, signal) => {
      if (event.type !== type) return;
      return handler(event as Extract<AgentEvent, { type: T }>, signal);
    };
    let handlers = typedHandlers.get(type);
    if (!handlers) {
      handlers = new Set();
      typedHandlers.set(type, handlers);
    }
    handlers.add(erasedHandler);
    return () => {
      handlers!.delete(erasedHandler);
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

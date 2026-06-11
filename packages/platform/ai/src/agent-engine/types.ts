/**
 * Agent Engine 核心类型定义
 *
 * 对齐参考实现的 AgentTool、AgentToolResult、ToolExecutionMode 等，
 * 同时保持 VentoStack 的函数式风格。
 */
import type { AgentEventEmitter, AgentEventMessage } from "./events";

// ---- 工具执行模式 ----

/** 工具调用执行模式 */
export type ToolExecutionMode = "sequential" | "parallel";

// ---- 工具结果 ----

/** 工具执行结果 */
export interface AgentToolResult<T = unknown> {
  /** 返回给模型的文本/图片内容 */
  content: Array<{ type: "text"; text: string } | { type: "image"; url: string }>;
  /** 结构化细节（日志/UI 渲染） */
  details: T;
  /** 提示 agent 在当前工具批次结束后停止 */
  terminate?: boolean;
}

/** 工具执行过程中的部分结果回调 */
export type ToolUpdateCallback<T = unknown> = (partialResult: AgentToolResult<T>) => void;

// ---- 工具定义 ----

/** 工具定义（增强版） */
export interface AgentTool<TParams = Record<string, unknown>> {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 参数 JSON Schema */
  parameters: Record<string, unknown>;
  /** 人类可读标签（UI 展示） */
  label?: string;
  /** 参数预处理 shim（在 schema 校验前修正 LLM 输出） */
  prepareArguments?: (args: unknown) => TParams;
  /** 执行工具 */
  execute: (
    toolCallId: string,
    params: TParams,
    signal?: AbortSignal,
    onUpdate?: ToolUpdateCallback,
  ) => Promise<AgentToolResult>;
  /** 是否需要审批 */
  requiresApproval?: boolean;
  /** 风险等级 */
  riskLevel?: "low" | "medium" | "high" | "critical";
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 覆盖全局执行模式 */
  executionMode?: ToolExecutionMode;
}

// ---- Before/After 钩子 ----

/** beforeToolCall 上下文 */
export interface BeforeToolCallContext {
  /** 请求工具调用的 assistant 消息 */
  assistantMessage: AgentEventMessage;
  /** 原始工具调用块 */
  toolCall: { id: string; name: string; arguments: Record<string, unknown> };
  /** 校验后的参数 */
  args: unknown;
  /** 当前 agent 上下文 */
  context: AgentContext;
}

/** beforeToolCall 结果 */
export interface BeforeToolCallResult {
  /** 是否阻止执行 */
  block?: boolean;
  /** 阻止原因 */
  reason?: string;
}

/** afterToolCall 上下文 */
export interface AfterToolCallContext {
  assistantMessage: AgentEventMessage;
  toolCall: { id: string; name: string; arguments: Record<string, unknown> };
  args: unknown;
  result: AgentToolResult;
  isError: boolean;
  context: AgentContext;
}

/** afterToolCall 结果（字段级合并） */
export interface AfterToolCallResult {
  content?: AgentToolResult["content"];
  details?: unknown;
  isError?: boolean;
  terminate?: boolean;
}

// ---- Agent 上下文 ----

/** Agent 运行上下文 */
export interface AgentContext {
  /** 系统提示词 */
  systemPrompt: string;
  /** 对话消息 */
  messages: ChatMessage[];
  /** 可用工具 */
  tools?: AgentTool[];
}

/** 标准聊天消息 */
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  tool_call_id?: string;
  name?: string;
}

// ---- Agent 循环配置 ----

/** Agent 循环配置 */
export interface AgentLoopConfig {
  /** 模型 ID */
  model: string;
  /** 最大迭代次数 */
  maxIterations?: number;
  /** 工具执行模式 */
  toolExecution?: ToolExecutionMode;
  /** beforeToolCall 钩子 */
  beforeToolCall?: (
    context: BeforeToolCallContext,
    signal?: AbortSignal,
  ) => Promise<BeforeToolCallResult | undefined>;
  /** afterToolCall 钩子 */
  afterToolCall?: (
    context: AfterToolCallContext,
    signal?: AbortSignal,
  ) => Promise<AfterToolCallResult | undefined>;
  /** 事件发射器 */
  eventEmitter?: AgentEventEmitter;
  /** 获取 steering 消息 */
  getSteeringMessages?: () => Promise<ChatMessage[]>;
  /** 获取 follow-up 消息 */
  getFollowUpMessages?: () => Promise<ChatMessage[]>;
  /** 是否应该在 turn 结束后停止 */
  shouldStopAfterTurn?: (
    message: AgentEventMessage,
    toolResults: ChatMessage[],
    context: AgentContext,
  ) => boolean;
}

/** Agent 运行参数 */
export interface AgentRunParams {
  agentId: string;
  userId: string;
  sessionId?: string;
  message: string;
  tenantId: string;
  signal?: AbortSignal;
}

/** Agent 运行结果（非流式） */
export interface AgentRunResult {
  content: string;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  usage: { promptTokens: number; completionTokens: number };
  iterations: number;
}

// ---- 消息预算 ----

export interface TokenBudget {
  maxPromptTokens: number;
  maxCompletionTokens: number;
  reservedForContext: number;
}

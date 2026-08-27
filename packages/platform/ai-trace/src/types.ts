/**
 * @ventostack/ai-trace — 链路追踪领域类型
 *
 * 一次 Agent 运行（一个用户消息 → 完整 agent loop → 最终回复）= 一条 Trace。
 * Trace 内的每个步骤（LLM 调用 / 工具执行）= 一条 Span。
 */

import type { AgentEventEmitter } from "@ventostack/ai";

/** 追踪状态 */
export type TraceStatus = "running" | "success" | "error" | "aborted" | "interrupted";

/** Span 类型 */
export type SpanType = "llm" | "tool";

/** Span 分类（工具名的语义分类） */
export type SpanCategory = "llm" | "knowledge_base" | "mcp" | "builtin";

/** Token 用量 */
export interface TraceTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** 运行元数据（来自 agent_start.meta） */
export interface TraceMeta {
  skillIds?: string[];
  knowledgeBaseIds?: string[];
  mcpServerIds?: string[];
  toolNames?: string[];
  maxIterations?: number;
  researchMode?: boolean;
}

/** 链路记录（ai_trace 表行） */
export interface TraceRecord {
  id: string;
  conversationId: string;
  agentId: string | null;
  sessionId: string | null;
  userId: string;
  tenantId: string;
  status: TraceStatus;
  userMessage: string | null;
  assistantPreview: string | null;
  systemPrompt: string | null;
  model: string | null;
  meta: TraceMeta | null;
  usage: TraceTokenUsage | null;
  error: string | null;
  turnCount: number;
  toolCount: number;
  durationMs: number | null;
  startedAt: string;
  endedAt: string | null;
}

/** 链路步骤（ai_trace_span 表行） */
export interface TraceSpan {
  id: string;
  traceId: string;
  tenantId: string;
  seq: number;
  turnIndex: number;
  spanType: SpanType;
  name: string;
  category: SpanCategory;
  status: TraceStatus;
  /** llm: {model, messageCount, newMessages[]}；tool: {args} */
  input: Record<string, unknown> | null;
  /** llm: {content, stopReason, usage, provider}；tool: {result} */
  output: Record<string, unknown> | null;
  error: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
}

/** 会话聚合列表项 */
export interface TraceConversationItem {
  id: string;
  title: string | null;
  agentId: string | null;
  userId: string | null;
  tenantId: string;
  messageCount: number;
  traceCount: number;
  totalTokens: number;
  lastTraceAt: string | null;
  createdAt: string | null;
}

/** 会话消息时间线项（一条 trace = 用户消息 + 助手回复） */
export interface TraceMessageItem {
  traceId: string;
  userMessage: string;
  assistantPreview: string;
  status: TraceStatus;
  model: string | null;
  turnCount: number;
  toolCount: number;
  usage: TraceTokenUsage | null;
  durationMs: number | null;
  startedAt: string;
}

/** 追踪详情（trace + 全部 spans） */
export interface TraceDetail {
  trace: TraceRecord;
  spans: TraceSpan[];
}

/** 复用框架 AI 事件发射器类型（避免重复定义） */
export type TraceEventEmitter = AgentEventEmitter;

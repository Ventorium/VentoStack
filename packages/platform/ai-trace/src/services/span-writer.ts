/**
 * @ventostack/ai-trace — span 落库写入器
 *
 * 从 recorder 状态机中拆出的 span 生命周期写入：
 * 开启时 insert（status=running），关闭时按主键 update，异常兜底关闭未闭合 span。
 */

import type { AgentEvent, AgentEventMessage } from "@ventostack/ai";
import type { TraceStatus } from "../types";
import type { RunBuffer } from "./run-buffer";
import { categorizeTool, newSpanId, nextSeq, parseMcpServerName } from "./run-buffer";
import type { TraceStore } from "./trace-store";

export interface SpanWriter {
  /** before_provider_request：打开 LLM span（input = 本轮增量消息） */
  openLlmSpan(
    buffer: RunBuffer,
    event: Extract<AgentEvent, { type: "before_provider_request" }>,
    maxBuffered: number,
  ): Promise<void>;
  /** assistant message_end：关闭 LLM span 并写入响应 */
  closeLlmSpan(buffer: RunBuffer, message: AgentEventMessage): Promise<void>;
  /** 兜底：关闭未正常结束的 LLM span（如流 error 提前终止） */
  closeOpenLlmSpan(buffer: RunBuffer, status: TraceStatus, error: string | null): Promise<void>;
  /** tool_execution_start：打开工具 span */
  openToolSpan(buffer: RunBuffer, event: Extract<AgentEvent, { type: "tool_execution_start" }>): Promise<void>;
  /** tool_execution_end：关闭工具 span 并写入结果 */
  closeToolSpan(buffer: RunBuffer, event: Extract<AgentEvent, { type: "tool_execution_end" }>): Promise<void>;
  /** finalize 兜底：关闭所有仍未闭合的 span（LLM + 工具） */
  closeOpenSpans(buffer: RunBuffer, status: TraceStatus, error: string | null): Promise<void>;
}

export function createSpanWriter(deps: { store: TraceStore }): SpanWriter {
  const { store } = deps;

  async function openLlmSpan(
    buffer: RunBuffer,
    event: Extract<AgentEvent, { type: "before_provider_request" }>,
    maxBuffered: number,
  ): Promise<void> {
    const seq = nextSeq(buffer);
    const span = {
      id: newSpanId(),
      seq,
      turnIndex: buffer.turnIndex,
      name: event.model,
      startedAt: Date.now(),
    };
    buffer.openLlm = span;
    const newMessages = buffer.pendingMessages.slice(-maxBuffered);
    await store.insertSpan({
      id: span.id,
      traceId: buffer.traceId,
      tenantId: buffer.tenantId,
      seq,
      turnIndex: buffer.turnIndex,
      spanType: "llm",
      name: event.model,
      category: "llm",
      status: "running",
      input: { model: event.model, messageCount: event.messageCount, newMessages },
      output: null,
      error: null,
      startedAt: new Date(span.startedAt).toISOString(),
      endedAt: null,
      durationMs: null,
    });
    buffer.pendingMessages = [];
  }

  async function closeLlmSpan(buffer: RunBuffer, message: AgentEventMessage): Promise<void> {
    const span = buffer.openLlm;
    buffer.openLlm = null;
    if (!span) return;
    const endedAt = Date.now();
    const isError = message.stopReason === "error";
    await store.updateSpan(span.id, buffer.tenantId, {
      status: isError ? "error" : "success",
      name: message.model ?? span.name,
      output: {
        content: message.content,
        stopReason: message.stopReason ?? null,
        usage: message.usage ?? null,
        model: message.model ?? null,
        provider: message.provider ?? null,
        toolCalls: message.toolCalls ?? null,
      },
      error: message.errorMessage ?? null,
      endedAt: new Date(endedAt),
      durationMs: endedAt - span.startedAt,
    });
  }

  async function closeOpenLlmSpan(buffer: RunBuffer, status: TraceStatus, error: string | null): Promise<void> {
    const span = buffer.openLlm;
    buffer.openLlm = null;
    if (!span) return;
    const endedAt = Date.now();
    await store.updateSpan(span.id, buffer.tenantId, {
      status,
      error,
      endedAt: new Date(endedAt),
      durationMs: endedAt - span.startedAt,
    });
  }

  async function openToolSpan(
    buffer: RunBuffer,
    event: Extract<AgentEvent, { type: "tool_execution_start" }>,
  ): Promise<void> {
    const seq = nextSeq(buffer);
    const spanId = newSpanId();
    buffer.openTools.set(event.toolCallId, {
      id: spanId,
      seq,
      turnIndex: buffer.turnIndex,
      name: event.toolName,
      startedAt: Date.now(),
    });
    const mcpServer = parseMcpServerName(event.toolName);
    await store.insertSpan({
      id: spanId,
      traceId: buffer.traceId,
      tenantId: buffer.tenantId,
      seq,
      turnIndex: buffer.turnIndex,
      spanType: "tool",
      name: event.toolName,
      category: categorizeTool(event.toolName),
      status: "running",
      input: { args: event.args, ...(mcpServer ? { mcpServer } : {}) },
      output: null,
      error: null,
      startedAt: new Date().toISOString(),
      endedAt: null,
      durationMs: null,
    });
  }

  async function closeToolSpan(
    buffer: RunBuffer,
    event: Extract<AgentEvent, { type: "tool_execution_end" }>,
  ): Promise<void> {
    const span = buffer.openTools.get(event.toolCallId);
    buffer.openTools.delete(event.toolCallId);
    if (!span) return;
    const endedAt = Date.now();
    await store.updateSpan(span.id, buffer.tenantId, {
      status: event.isError ? "error" : "success",
      output: { result: event.result },
      error: event.isError ? "工具执行失败" : null,
      endedAt: new Date(endedAt),
      durationMs: endedAt - span.startedAt,
    });
  }

  async function closeOpenSpans(buffer: RunBuffer, status: TraceStatus, error: string | null): Promise<void> {
    if (buffer.openLlm) await closeOpenLlmSpan(buffer, status, error);
    const openTools = [...buffer.openTools.values()];
    buffer.openTools.clear();
    const endedAt = new Date();
    for (const span of openTools) {
      await store.updateSpan(span.id, buffer.tenantId, {
        status,
        error,
        endedAt,
        durationMs: endedAt.getTime() - span.startedAt,
      });
    }
  }

  return { openLlmSpan, closeLlmSpan, closeOpenLlmSpan, openToolSpan, closeToolSpan, closeOpenSpans };
}

/**
 * @ventostack/ai-trace — 链路记录器（事件 → trace 状态机）
 *
 * 订阅框架 AI 模块的全局事件发射器，按 event.run 上下文路由并发运行。
 * span 的开启/关闭落库委托给 span-writer，本模块只维护 trace 生命周期
 * 与增量消息队列。
 *
 * 增量消息策略：trace 级保存完整 system prompt + 用户消息；
 * 每个 LLM span 只保存本轮新增消息（首轮为用户消息，后续轮为上轮
 * assistant 输出 / 工具结果 / steering 注入的用户消息）。
 */

import type { AgentEvent } from "@ventostack/ai";
import { createTagLogger } from "@ventostack/core";
import type { TraceEventEmitter } from "../types";
import { createRunBuffer, type RunBuffer } from "./run-buffer";
// 兼容既有导入路径：纯函数迁移至 run-buffer 后保持原导出
export { categorizeTool, parseMcpServerName } from "./run-buffer";
import { createSpanWriter } from "./span-writer";
import type { TraceStore } from "./trace-store";

const logger = createTagLogger("ai-trace");

/** 追踪开关读取器（由 trace-config 提供） */
export interface TraceToggle {
  isEnabled(): Promise<boolean>;
}

/** 记录器依赖 */
export interface TraceRecorderDeps {
  emitter: TraceEventEmitter;
  store: TraceStore;
  toggle: TraceToggle;
  /** 单 run 事件缓冲上限（超出时丢弃最旧增量消息，防御异常长运行） */
  maxBufferedMessages?: number;
}

export interface TraceRecorder {
  /** 处理单个事件（暴露给测试；生产由 emitter 订阅驱动） */
  handleEvent(event: AgentEvent): Promise<void>;
  /** 启动订阅 */
  start(): void;
  /** 停止订阅 */
  stop(): void;
  /** 活跃 run 数（观测） */
  activeRuns(): number;
}

export function createTraceRecorder(deps: TraceRecorderDeps): TraceRecorder {
  const { emitter, store, toggle } = deps;
  const maxBuffered = deps.maxBufferedMessages ?? 200;
  const writer = createSpanWriter({ store });
  const buffers = new Map<string, RunBuffer>();

  /** 忽略无 run 上下文的事件（非 runStream 发出，或旧版本框架） */
  function bufferOf(event: AgentEvent): RunBuffer | undefined {
    if (!event.run) return undefined;
    return buffers.get(event.run.runId);
  }

  async function handleEvent(event: AgentEvent): Promise<void> {
    // agent_start 在缓冲不存在时创建（开关检查也在此处）
    if (event.type === "agent_start") {
      await onAgentStart(event);
      return;
    }
    const buffer = bufferOf(event);
    if (!buffer) return;
    if (buffer.skipped) {
      // 开关关闭的 run：仅处理终止事件以清理 buffer，避免内存泄漏
      if (
        event.type === "agent_end" ||
        event.type === "abort" ||
        event.type === "error" ||
        event.type === "settled"
      ) {
        buffers.delete(buffer.traceId);
      }
      return;
    }

    try {
      switch (event.type) {
        case "context":
          await onContext(buffer, event);
          break;
        case "turn_start":
          buffer.turnIndex += 1;
          buffer.turnCount = buffer.turnIndex;
          break;
        case "before_provider_request":
          // 上一轮 LLM span 未正常关闭（如流 error 提前 return）时兜底关闭
          await writer.closeOpenLlmSpan(buffer, "error", "LLM 流提前终止");
          await writer.openLlmSpan(buffer, event, maxBuffered);
          break;
        case "message_end":
          await onMessageEnd(buffer, event.message);
          break;
        case "tool_execution_start":
          await writer.openToolSpan(buffer, event);
          break;
        case "tool_execution_end":
          buffer.toolCount += 1;
          await writer.closeToolSpan(buffer, event);
          break;
        case "tools_added":
          await store.updateTrace(buffer.traceId, buffer.tenantId, { appendToolNames: event.toolNames });
          break;
        case "agent_end": {
          const finalMessage = event.messages.at(-1);
          await finalize(buffer, "success", finalMessage?.content ?? buffer.finalAssistantContent);
          break;
        }
        case "abort":
          await finalize(buffer, "aborted", undefined, "运行被中止");
          break;
        case "error":
          await finalize(buffer, "error", undefined, `${event.error.code}: ${event.error.message}`);
          break;
        case "settled":
          // 兜底：正常结束时 agent_end 已清理 buffer，此处仅处理异常终止路径（事件丢失场景）
          await finalize(buffer, "success");
          break;
        default:
          break;
      }
    } catch (err) {
      // 记录失败不阻断对话主流程
      logger.error(`记录链路事件失败(${event.type}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function onAgentStart(event: Extract<AgentEvent, { type: "agent_start" }>): Promise<void> {
    const run = event.run;
    if (!run?.runId || !run.tenantId || !run.sessionId) return;
    // 开关关闭：仍然建 buffer（标记 skipped）以便收到终止事件时清理
    const enabled = await toggle.isEnabled().catch(() => false);
    const buffer = createRunBuffer({
      traceId: run.runId,
      tenantId: run.tenantId,
      conversationId: run.sessionId,
      skipped: !enabled,
    });
    buffers.set(run.runId, buffer);
    if (!enabled) return;

    await store.insertTrace({
      id: buffer.traceId,
      conversationId: buffer.conversationId,
      agentId: run.agentId ?? null,
      sessionId: run.sessionId,
      userId: run.userId ?? "",
      tenantId: buffer.tenantId,
      status: "running",
      userMessage: event.meta?.userMessage ?? null,
      assistantPreview: null,
      systemPrompt: null,
      model: event.meta?.model ?? null,
      meta: {
        skillIds: event.meta?.skillIds,
        knowledgeBaseIds: event.meta?.knowledgeBaseIds,
        mcpServerIds: event.meta?.mcpServerIds,
        toolNames: event.meta?.toolNames,
        maxIterations: event.meta?.maxIterations,
        researchMode: event.meta?.researchMode,
      },
      usage: null,
      error: null,
      turnCount: 0,
      toolCount: 0,
      durationMs: null,
      startedAt: new Date().toISOString(),
      endedAt: null,
    });
  }

  async function onContext(buffer: RunBuffer, event: Extract<AgentEvent, { type: "context" }>): Promise<void> {
    // 初始上下文：保存 system prompt（含注入的 skills/KB 引导）与首轮增量消息
    const userMessages = event.messages.filter((m) => m.role === "user");
    buffer.pendingMessages = userMessages.slice(-1);
    await store.updateTrace(buffer.traceId, buffer.tenantId, { systemPrompt: event.systemPrompt });
  }

  async function onMessageEnd(buffer: RunBuffer, message: AgentEventMessage): Promise<void> {
    switch (message.role) {
      case "assistant": {
        if (message.usage) {
          buffer.usage.promptTokens += message.usage.promptTokens;
          buffer.usage.completionTokens += message.usage.completionTokens;
        }
        await writer.closeLlmSpan(buffer, message);
        // 本轮 assistant 输出 → 下一轮 LLM 的增量输入
        buffer.pendingMessages.push(message);
        if (message.content) buffer.finalAssistantContent = message.content;
        break;
      }
      case "tool":
      case "user":
        // 工具结果 / steering 注入的用户消息 → 下一轮 LLM 的增量输入
        buffer.pendingMessages.push(message);
        break;
      default:
        break;
    }
  }

  async function finalize(
    buffer: RunBuffer,
    status: "success" | "error" | "aborted",
    assistantContent?: string,
    error?: string,
  ): Promise<void> {
    buffers.delete(buffer.traceId);
    if (buffer.skipped) return;
    // 未闭合的 span 兜底关闭（正常路径已在对应事件中关闭）
    const spanStatus = status === "success" ? "interrupted" : status;
    await writer.closeOpenSpans(buffer, spanStatus, error ?? null);

    const endedAt = new Date();
    const preview = assistantContent ? assistantContent.slice(0, 200) : null;
    await store.updateTrace(buffer.traceId, buffer.tenantId, {
      status,
      ...(preview !== undefined ? { assistantPreview: preview } : {}),
      ...(error !== undefined ? { error } : {}),
      turnCount: buffer.turnCount,
      toolCount: buffer.toolCount,
      durationMs: endedAt.getTime() - buffer.startedAt,
      endedAt,
      usage: {
        promptTokens: buffer.usage.promptTokens,
        completionTokens: buffer.usage.completionTokens,
        totalTokens: buffer.usage.promptTokens + buffer.usage.completionTokens,
      },
    });
  }

  let unsubscribe: (() => void) | null = null;

  return {
    handleEvent,
    start(): void {
      if (unsubscribe) return;
      unsubscribe = emitter.on((event) => handleEvent(event));
    },
    stop(): void {
      unsubscribe?.();
      unsubscribe = null;
    },
    activeRuns(): number {
      return buffers.size;
    },
  };
}

/**
 * SSE 流式聊天客户端
 *
 * 完全基于 @doremijs/o2t 的原生 SSE Streaming API（iterateStream）实现：
 * - SSE 读取、事件拆分、JSON 解析全部由 o2t 处理，本地不再维护任何 SSE 解析逻辑
 * - 认证与 token 刷新由 api/index.ts 的 client 实例负责
 */
import { iterateStream } from "@doremijs/o2t/client/stream";
import { client } from "@/api";

export interface StreamCallbacks {
  onContent: (delta: string) => void;
  onToolCall?: (toolCall: { id: string; name: string }) => void;
  onUsage?: (usage: { promptTokens: number; completionTokens: number }) => void;
  /** 深度研究阶段事件：planning → researching → synthesizing */
  onStage?: (stage: "planning" | "researching" | "synthesizing") => void;
  /** 引用来源清单（研究产出后下发） */
  onSources?: (sources: Array<{ title: string; url: string }>) => void;
  onError: (error: { code: string; message: string; recoverable: boolean }) => void;
  onDone: () => void;
}

export interface ChatStreamParams {
  agentId: string;
  message: string;
  sessionId?: string;
  tools?: string[];
  skillIds?: string[];
  mcpServerIds?: string[];
  knowledgeBaseIds?: string[];
}

/**
 * 后端 AI 流式 chunk（与 packages/framework/ai 的 StreamChunk 对齐）
 */
export interface AIStreamChunk {
  type: "content" | "tool_call_start" | "usage" | "stage" | "sources" | "error" | "done";
  delta?: string;
  toolCall?: { id: string; name: string };
  usage?: { promptTokens: number; completionTokens: number };
  stage?: "planning" | "researching" | "synthesizing";
  sources?: Array<{ title: string; url: string }>;
  error?: { code: string; message: string; recoverable: boolean };
}

/**
 * 使用 o2t client 发起流式聊天请求，通过 o2t 原生 iterateStream 消费 SSE 流。
 * - onDone 只在流自然结束后触发一次（o2t 解析完所有事件后迭代器结束）
 * - abort 由调用方传入的 AbortSignal 控制
 */
export async function streamChat(
  params: ChatStreamParams,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const { error, response } = (await client.post("/api/ai/chat/stream", {
      body: params,
      signal,
    })) as { error?: unknown; response?: Response };

    if (error || !response) {
      callbacks.onError({ code: "REQUEST_FAILED", message: "请求失败", recoverable: false });
      return;
    }

    if (!response.ok) {
      callbacks.onError({
        code: `HTTP_${response.status}`,
        message: `请求失败: ${response.status}`,
        recoverable: false,
      });
      return;
    }

    // o2t 原生流式迭代：SSE 读取、事件拆分、JSON 解析均由 o2t 完成，
    // 本地只做业务事件分发（dispatchChunk）。
    for await (const event of iterateStream<AIStreamChunk>(response)) {
      if (signal?.aborted) break;
      if (event.data === null) continue; // 非 JSON 数据（如 [DONE]）
      dispatchChunk(event.data, callbacks);
    }
    // abort 后不触发 onDone：由调用方的停止逻辑（handleStop）自行收尾
    if (!signal?.aborted) callbacks.onDone();
  } catch (err) {
    if (signal?.aborted) return;
    callbacks.onError({
      code: "NETWORK_ERROR",
      message: err instanceof Error ? err.message : "网络错误",
      recoverable: true,
    });
  }
}

/**
 * 业务事件分发：把 o2t 解析好的 chunk 映射为业务回调。
 * 注意：不处理 "done" 事件——onDone 统一由 iterateStream 迭代自然结束后触发，
 * 避免后端 done chunk 与流结束重复触发 onDone。
 */
export function dispatchChunk(chunk: AIStreamChunk, callbacks: StreamCallbacks): void {
  switch (chunk.type) {
    case "content":
      if (chunk.delta) callbacks.onContent(chunk.delta);
      break;
    case "tool_call_start":
      if (chunk.toolCall) callbacks.onToolCall?.(chunk.toolCall);
      break;
    case "usage":
      if (chunk.usage) callbacks.onUsage?.(chunk.usage);
      break;
    case "stage":
      if (chunk.stage) callbacks.onStage?.(chunk.stage);
      break;
    case "sources":
      if (chunk.sources) callbacks.onSources?.(chunk.sources);
      break;
    case "error":
      if (chunk.error) callbacks.onError(chunk.error);
      break;
    case "done":
      // 忽略：onDone 由流结束统一触发
      break;
  }
}

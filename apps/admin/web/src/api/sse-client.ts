/**
 * SSE 流式聊天客户端
 *
 * 使用 @doremijs/o2t 的 processStream 代替手写 SSE 解析，
 * 通过 api/index.ts 的 client 实例处理认证和 token 刷新。
 */
import { client } from "@/api";

export interface StreamCallbacks {
  onContent: (delta: string) => void;
  onToolCall?: (toolCall: { id: string; name: string }) => void;
  onUsage?: (usage: { promptTokens: number; completionTokens: number }) => void;
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
 * 使用 o2t client 发起流式聊天请求，通过 processStream 处理 SSE 流。
 * client 已内置 token 注入和 401 自动刷新，无需手动处理。
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

    // 使用 o2t 的 processStream 解析 SSE 流
    const { processStream } = await import("@doremijs/o2t/client/stream");
    await processStream(response, {
      onData: (chunk: Record<string, unknown>) => {
        handleStreamChunk(chunk, callbacks);
      },
      onError: (error: Error) => {
        if (signal?.aborted) return;
        callbacks.onError({
          code: "STREAM_ERROR",
          message: error.message,
          recoverable: true,
        });
      },
      onComplete: () => {
        callbacks.onDone();
      },
    });
  } catch (err) {
    if (signal?.aborted) return;
    callbacks.onError({
      code: "NETWORK_ERROR",
      message: err instanceof Error ? err.message : "网络错误",
      recoverable: true,
    });
  }
}

function handleStreamChunk(chunk: Record<string, unknown>, callbacks: StreamCallbacks): void {
  const type = chunk.type as string;

  switch (type) {
    case "content":
      if (chunk.delta) callbacks.onContent(chunk.delta as string);
      break;
    case "tool_call_start":
      if (chunk.toolCall) {
        const tc = chunk.toolCall as { id: string; name: string };
        callbacks.onToolCall?.(tc);
      }
      break;
    case "usage":
      if (chunk.usage) {
        const u = chunk.usage as { promptTokens: number; completionTokens: number };
        callbacks.onUsage?.(u);
      }
      break;
    case "error":
      if (chunk.error) {
        callbacks.onError(chunk.error as { code: string; message: string; recoverable: boolean });
      }
      break;
    case "done":
      callbacks.onDone();
      break;
  }
}

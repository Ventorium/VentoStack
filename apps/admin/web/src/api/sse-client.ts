/**
 * SSE 客户端（使用 fetch + ReadableStream）
 * 支持 token 认证，自动重连
 *
 * Token 刷新复用 token-helper.ts 的共享逻辑，不重复实现。
 */
import { getValidToken } from "./token-helper";

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
 * 流式聊天请求
 */
export async function streamChat(
  params: ChatStreamParams,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const token = await getValidToken();
  if (!token) {
    callbacks.onError({ code: "UNAUTHORIZED", message: "未登录", recoverable: false });
    return;
  }

  try {
    const response = await fetch("/api/ai/chat/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(params),
      signal: signal ?? null,
    });

    if (response.status === 401) {
      // Token 过期，尝试刷新后重试
      const newToken = await getValidToken();
      if (newToken) {
        const retryResponse = await fetch("/api/ai/chat/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${newToken}`,
          },
          body: JSON.stringify(params),
          signal: signal ?? null,
        });
        if (retryResponse.ok) {
          await parseSSEStream(retryResponse, callbacks, signal);
          return;
        }
      }
      callbacks.onError({ code: "UNAUTHORIZED", message: "认证失败", recoverable: false });
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

    await parseSSEStream(response, callbacks, signal);
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
 * 解析 SSE 流
 */
async function parseSSEStream(
  response: Response,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop()!;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;

        if (trimmed.startsWith("data: ")) {
          const data = trimmed.slice(6);
          try {
            const chunk = JSON.parse(data);
            handleStreamChunk(chunk, callbacks);
          } catch {
            // 忽略无法解析的数据
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
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

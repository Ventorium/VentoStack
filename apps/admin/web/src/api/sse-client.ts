/**
 * SSE 客户端（使用 fetch + ReadableStream）
 * 支持 token 认证，自动重连
 */
import { getAccessToken, getRefreshToken, setAccessToken, setRefreshToken } from "@/store/token";

export interface StreamCallbacks {
  onContent: (delta: string) => void;
  onToolCall?: (toolCall: { id: string; name: string }) => void;
  onError: (error: { code: string; message: string; recoverable: boolean }) => void;
  onDone: () => void;
}

export interface ChatStreamParams {
  agentId: string;
  message: string;
  sessionId?: string;
  // 能力开关
  tools?: string[];
  skillIds?: string[];
  mcpServerIds?: string[];
  knowledgeBaseIds?: string[];
}

// Token 刷新状态
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

async function getValidToken(): Promise<string | null> {
  const token = getAccessToken();
  if (token) return token;

  // 尝试刷新
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return null;

      isRefreshing = true;
      try {
        const res = await fetch("/api/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        const json = await res.json();
        const data = json?.data ?? json;
        if (res.ok && data?.accessToken) {
          setAccessToken(data.accessToken);
          if (data.refreshToken) setRefreshToken(data.refreshToken);
          return data.accessToken as string;
        }
        return null;
      } catch {
        return null;
      } finally {
        isRefreshing = false;
        refreshPromise = null;
      }
    })();
  }

  return refreshPromise;
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

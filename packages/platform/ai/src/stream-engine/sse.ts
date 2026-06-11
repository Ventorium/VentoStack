/**
 * SSE 流式响应引擎
 * 将 LLM 流转换为 SSE Response
 */
import type { StreamChunk } from "../llm-gateway/types";

export interface StreamOptions {
  signal?: AbortSignal;
  heartbeatIntervalMs?: number;
}

const DEFAULT_HEARTBEAT_MS = 15000;

/**
 * 将 AsyncIterable<StreamChunk> 转换为 SSE Response
 */
export function createSSEResponse(
  stream: AsyncIterable<StreamChunk>,
  options: StreamOptions = {},
): Response {
  const encoder = new TextEncoder();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const readable = new ReadableStream({
    async start(controller) {
      // 心跳
      const heartbeatMs =
        options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_MS;
      heartbeatTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          // stream 已关闭
        }
      }, heartbeatMs);

      // AbortSignal 处理
      const abortHandler = () => {
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      options.signal?.addEventListener("abort", abortHandler);

      try {
        for await (const chunk of stream) {
          if (options.signal?.aborted) break;
          const data = `data: ${JSON.stringify(chunk)}\n\n`;
          controller.enqueue(encoder.encode(data));
        }
      } catch (err) {
        // 发送错误 chunk
        const errorChunk: StreamChunk = {
          type: "error",
          error: {
            code: "STREAM_ERROR",
            message: err instanceof Error ? err.message : "Unknown error",
            recoverable: false,
          },
        };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`),
        );
      } finally {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        options.signal?.removeEventListener("abort", abortHandler);
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * 收集流式结果为完整结果
 */
export async function collectStream(
  stream: AsyncIterable<StreamChunk>,
): Promise<{ content: string; toolCalls: unknown[]; usage: unknown }> {
  let content = "";
  const toolCalls: unknown[] = [];
  let usage: unknown;

  for await (const chunk of stream) {
    switch (chunk.type) {
      case "content":
        content += chunk.delta ?? "";
        break;
      case "tool_call_start":
        if (chunk.toolCall) toolCalls.push(chunk.toolCall);
        break;
      case "usage":
        usage = chunk.usage;
        break;
    }
  }

  return { content, toolCalls, usage };
}

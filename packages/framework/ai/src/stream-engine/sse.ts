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
 *
 * 断开语义：客户端断开（刷新/关标签页）后**不打断**底层 generator，只停止写入并继续排空到结束。
 * 原因：审批等待、工具执行、会话落盘等副作用必须跑完——刷新页面后用户仍能确认审批并让本轮执行完，
 * 结果写进会话历史（见 module.ts 的审批台账）。显式停止由 POST /api/ai/chat/sessions/:id/stop 触发，
 * 通过 run 级 AbortSignal 让 generator 自行中断。
 */
export function createSSEResponse(
  stream: AsyncIterable<StreamChunk>,
  options: StreamOptions = {},
): Response {
  const encoder = new TextEncoder();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const readable = new ReadableStream({
    async start(controller) {
      // 断开标记：置位后不再写流，但不中断迭代
      let detached = false;
      const detach = () => {
        if (detached) return;
        detached = true;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      // 心跳
      const heartbeatMs =
        options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_MS;
      heartbeatTimer = setInterval(() => {
        if (detached) return;
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          // stream 已关闭
        }
      }, heartbeatMs);

      options.signal?.addEventListener("abort", detach);

      try {
        for await (const chunk of stream) {
          // 已断开：继续拉取（让 generator 跑完并落盘），只是不再下发
          if (detached) continue;
          const data = `data: ${JSON.stringify(chunk)}\n\n`;
          controller.enqueue(encoder.encode(data));
        }
      } catch (err) {
        // 发送错误 chunk（客户端已断开时无处可发）
        if (!detached) {
          const errorChunk: StreamChunk = {
            type: "error",
            error: {
              code: "STREAM_ERROR",
              message: err instanceof Error ? err.message : "Unknown error",
              recoverable: false,
            },
          };
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`),
            );
          } catch {
            // stream 已关闭
          }
        }
      } finally {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        options.signal?.removeEventListener("abort", detach);
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

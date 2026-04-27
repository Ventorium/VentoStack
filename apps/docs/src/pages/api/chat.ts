/**
 * RAG 问答 API Endpoint（支持 SSE 流式响应）
 *
 * 部署到 Cloudflare Workers 时使用 Workers AI（免费）。
 * 本地开发时回退到 OPENAI_API_KEY 配置的外部 LLM。
 */

import type { APIRoute } from "astro";
import { createKnowledgeBase } from "@ventostack/ai";
import kbDataRaw from "./kb-data.json";

export const prerender = false;

/** Cloudflare Workers AI 模型 */
const WORKERS_AI_MODEL = "@cf/meta/llama-3-8b-instruct";

// 重建知识库（防御性处理：某些打包器可能将 JSON 包装为 { default: [...] }）
const kbData = Array.isArray(kbDataRaw)
  ? kbDataRaw
  : (kbDataRaw as unknown as { default?: unknown[] }).default ?? [];
const kb = createKnowledgeBase();
for (const doc of kbData) {
  kb.add(doc);
}

interface ChatRequest {
  message: string;
}

function getEnv(key: string): string | undefined {
  const viteEnv = (import.meta.env as Record<string, string | undefined>)[key];
  if (viteEnv !== undefined) return viteEnv;
  return (process.env as Record<string, string | undefined>)[key];
}

/** 创建 SSE 流（模拟打字效果） */
function createSSEStream(text: string): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      const chunkSize = 8;
      let i = 0;
      function send() {
        if (i >= text.length) {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }
        const chunk = text.slice(i, i + chunkSize);
        const data = JSON.stringify({
          choices: [{ delta: { content: chunk } }],
        });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        i += chunkSize;
        setTimeout(send, 30);
      }
      send();
    },
  });
}

/** 调用本地/外部 LLM，返回 SSE 流 */
async function callExternalLLMStream(
  messages: Array<{ role: string; content: string }>,
): Promise<ReadableStream> {
  const apiKey = getEnv("OPENAI_API_KEY");
  const baseURL = getEnv("OPENAI_BASE_URL") ?? "https://api.openai.com/v1";
  const model = getEnv("OPENAI_MODEL") ?? "gpt-4.1-nano";

  if (!apiKey) {
    return createSSEStream(
      "LLM 未配置：本地开发请设置 OPENAI_API_KEY 环境变量。",
    );
  }

  const response = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      stream: true,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "unknown");
    return createSSEStream(`LLM API error ${response.status}: ${text.slice(0, 200)}`);
  }

  // 透传 LLM 的 SSE 流
  return response.body ?? createSSEStream("");
}

/** 调用 Cloudflare Workers AI，包装为 SSE 流 */
async function callWorkersAIStream(
  env: Record<string, unknown>,
  messages: Array<{ role: string; content: string }>,
): Promise<ReadableStream> {
  const ai = env.AI as {
    run(
      model: string,
      params: { messages: Array<{ role: string; content: string }> },
    ): Promise<{ response?: string; text?: string }>;
  };

  const result = await ai.run(WORKERS_AI_MODEL, { messages });
  const text = result.response ?? result.text ?? "";
  return createSSEStream(text);
}

export const POST: APIRoute = async ({ request, locals }) => {
  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return new Response(
      createSSEStream("错误：请求体必须是有效的 JSON。"),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  }

  const { message } = body;
  if (!message || typeof message !== "string") {
    return new Response(
      createSSEStream("错误：message 字段必填且为字符串。"),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  }

  // 检索相关文档
  const results = kb.search(message, 5);
  const context = results.map((r) => r.document.content).join("\n\n");

  // context 为空直接返回，不浪费 LLM 调用
  if (!context.trim()) {
    return new Response(
      createSSEStream("未检索到相关文档，请尝试使用其他关键词。"),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  }

  // 将上下文放入 system prompt，确保 LLM 能看到
  const systemPrompt =
    "你是 VentoStack 框架的技术文档助手。请严格基于下方提供的文档片段回答用户问题。" +
    "如果文档中没有相关信息，明确告知用户。不要编造信息。回答应简洁、准确，使用中文。\n\n" +
    "=== 文档片段 ===\n" +
    context +
    "\n=== 文档片段结束 ===";

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: message },
  ];

  try {
    const env = locals as Record<string, unknown>;

    const stream =
      env.AI && typeof env.AI === "object"
        ? await callWorkersAIStream(env, messages)
        : await callExternalLLMStream(messages);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return new Response(createSSEStream(`错误：${errorMsg}`), {
      headers: { "Content-Type": "text/event-stream" },
    });
  }
};

/**
 * RAG 问答 API Endpoint
 *
 * 部署到 Cloudflare Workers 时使用 Workers AI（免费）。
 * 本地开发时回退到 OPENAI_API_KEY 配置的外部 LLM。
 */

import type { APIRoute } from "astro";
import { createKnowledgeBase } from "@ventostack/ai";
import kbData from "./kb-data.json";

export const prerender = false;

/** Cloudflare Workers AI 模型 */
const WORKERS_AI_MODEL = "@cf/meta/llama-3-8b-instruct";

// 重建知识库
const kb = createKnowledgeBase();
for (const doc of kbData) {
  kb.add(doc);
}

interface ChatRequest {
  message: string;
}

interface ChatResponse {
  answer: string;
  sources: Array<{
    id: string;
    title: string;
    excerpt: string;
  }>;
}

async function callWorkersAI(
  env: Record<string, unknown>,
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  const ai = env.AI as {
    run(model: string, params: { messages: Array<{ role: string; content: string }> }): Promise<
      { response?: string; text?: string }
    >;
  };

  const result = await ai.run(WORKERS_AI_MODEL, { messages });
  return result.response ?? result.text ?? "";
}

async function callExternalLLM(
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  const apiKey = import.meta.env.OPENAI_API_KEY;
  const baseURL = import.meta.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const model = import.meta.env.OPENAI_MODEL ?? "gpt-4.1-nano";

  if (!apiKey) {
    throw new Error("LLM not configured: set OPENAI_API_KEY for local development");
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
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "unknown");
    throw new Error(`LLM API error ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return data.choices?.[0]?.message?.content ?? "";
}

export const POST: APIRoute = async ({ request, locals }) => {
  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { message } = body;
  if (!message || typeof message !== "string") {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 检索相关文档
  const results = kb.search(message, 5);
  const context = results.map((r) => r.document.content).join("\n\n");
  const sources = results.map((r) => ({
    id: r.document.id,
    title: String(r.document.metadata?.title ?? "未命名文档"),
    excerpt: r.document.content.slice(0, 200),
  }));

  const systemPrompt =
    "你是 VentoStack 框架的技术文档助手。基于提供的文档片段回答用户问题。" +
    "如果文档中没有相关信息，明确告知用户。不要编造信息。回答应简洁、准确，使用中文。";

  const messages = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `基于以下文档片段回答问题：\n\n${context}\n\n问题：${message}`,
    },
  ];

  try {
    // Astro v6 + @astrojs/cloudflare v13+: locals 直接是 Cloudflare env
    // 旧版: locals.runtime.env
    const localsRecord = locals as Record<string, unknown>;
    const runtime = localsRecord.runtime as Record<string, unknown> | undefined;
    const env = (runtime?.env as Record<string, unknown> | undefined) ?? localsRecord;

    let answer: string;
    if (env.AI) {
      answer = await callWorkersAI(env, messages);
    } else {
      answer = await callExternalLLM(messages);
    }

    const response: ChatResponse = { answer, sources };

    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

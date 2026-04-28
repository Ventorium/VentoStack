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

interface Chapter {
  source: string;
  title: string;
  url: string;
  preview: string;
  fullContent: string;
}

/** 将文档文件路径转换为站点相对 URL */
function docPathToUrl(source?: string): string {
  if (!source) return "#";
  let path = source.replace(/^src\/content\/docs\//, "");
  path = path.replace(/\.mdx?$/i, "");
  if (path === "index") return "/";
  path = "/" + path;
  if (!path.endsWith("/")) path += "/";
  return path;
}

/** 从知识库构建章节索引（按 source 分组，保留完整内容） */
function buildChapterIndex(): Chapter[] {
  const bySource = new Map<string, (typeof kbData)[0][]>();
  for (const doc of kbData) {
    const source = doc.metadata?.source as string;
    if (!source) continue;
    if (!bySource.has(source)) bySource.set(source, []);
    bySource.get(source)!.push(doc);
  }

  return Array.from(bySource.entries()).map(([source, docs]) => {
    const title = (docs[0].metadata?.title as string) || "无标题";
    const url = docPathToUrl(source);
    const fullContent = docs.map((d) => d.content).join("\n\n");
    const preview = fullContent.replace(/\s+/g, " ").trim().slice(0, 300);
    return { source, title, url, preview, fullContent };
  });
}

const chapters = buildChapterIndex();

/** 调用本地/外部 LLM（非流式），返回文本 */
async function callExternalLLM(
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  const apiKey = getEnv("OPENAI_API_KEY");
  const baseURL = getEnv("OPENAI_BASE_URL") ?? "https://api.openai.com/v1";
  const model = getEnv("OPENAI_MODEL") ?? "gpt-4.1-nano";

  if (!apiKey) return "";

  const response = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1,
      stream: false,
    }),
  });

  if (!response.ok) return "";
  const data = await response.json().catch(() => ({}));
  return data.choices?.[0]?.message?.content ?? "";
}

/** 调用 Cloudflare Workers AI（非流式），返回文本 */
async function callWorkersAI(
  env: Record<string, unknown>,
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  const ai = env.AI as {
    run(
      model: string,
      params: { messages: Array<{ role: string; content: string }> },
    ): Promise<{ response?: string; text?: string }>;
  };

  const result = await ai.run(WORKERS_AI_MODEL, { messages });
  return result.response ?? result.text ?? "";
}

/** 使用 LLM 选择最相关的章节（最多 5 个） */
async function selectChaptersWithLLM(
  env: Record<string, unknown> | null,
  message: string,
  chapters: Chapter[],
): Promise<Chapter[]> {
  const list = chapters
    .map((c, i) => `${i + 1}. ${c.title}\n   ${c.preview}`)
    .join("\n");

  const prompt = [
    {
      role: "system",
      content:
        "你是文档路由助手。请从下方章节列表中，选择最多5个与用户问题最相关的章节。只返回章节编号（例如：1,3,5），用逗号分隔，不要有任何解释。",
    },
    {
      role: "user",
      content: `用户问题：${message}\n\n可选章节：\n${list}`,
    },
  ];

  const text =
    env && typeof env.AI === "object"
      ? await callWorkersAI(env, prompt)
      : await callExternalLLM(prompt);

  const indices =
    text
      .match(/\d+/g)
      ?.map((n) => parseInt(n, 10) - 1)
      .filter((i) => i >= 0 && i < chapters.length) ?? [];
  return [...new Set(indices)].slice(0, 5).map((i) => chapters[i]);
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

/** 精简 SSE 事件：只保留 delta.content / delta.reasoning，去除 logprobs 等噪音 */
function stripSSEPayload(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    const delta = parsed.choices?.[0]?.delta;
    const stripped: Record<string, unknown> = {};
    if (delta?.content !== undefined) stripped.content = delta.content;
    if (delta?.reasoning !== undefined) stripped.reasoning = delta.reasoning;
    return JSON.stringify({ choices: [{ delta: stripped }] });
  } catch {
    return raw;
  }
}

/** 在 LLM SSE 流结束前注入 sources 事件 */
function wrapLLMStreamWithSources(
  llmStream: ReadableStream,
  sources: Array<{ title: string; url: string }>,
): ReadableStream {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";

  return new ReadableStream({
    async start(controller) {
      const reader = llmStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE events are separated by double newlines
          const events = buffer.split("\n\n");
          buffer = events.pop() || "";

          for (const event of events) {
            const dataMatch = event.match(/^data: (.+)$/m);
            if (!dataMatch) {
              controller.enqueue(encoder.encode(event + "\n\n"));
              continue;
            }
            const data = dataMatch[1];
            if (data === "[DONE]") {
              // Inject sources before forwarding [DONE]
              const sourcesPayload = JSON.stringify({
                choices: [{ delta: { content: "" } }],
                sources,
              });
              controller.enqueue(
                encoder.encode(`data: ${sourcesPayload}\n\n`),
              );
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            } else {
              const stripped = stripSSEPayload(data);
              controller.enqueue(
                encoder.encode(`data: ${stripped}\n\n`),
              );
            }
          }
        }

        // Flush remaining buffer
        if (buffer.trim()) {
          const dataMatch = buffer.match(/^data: (.+)$/m);
          if (dataMatch && dataMatch[1] === "[DONE]") {
            const sourcesPayload = JSON.stringify({
              choices: [{ delta: { content: "" } }],
              sources,
            });
            controller.enqueue(
              encoder.encode(`data: ${sourcesPayload}\n\n`),
            );
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          } else if (dataMatch) {
            const stripped = stripSSEPayload(dataMatch[1]);
            controller.enqueue(encoder.encode(`data: ${stripped}\n\n`));
          } else {
            controller.enqueue(encoder.encode(buffer + "\n\n"));
          }
        }
      } finally {
        reader.releaseLock();
      }
      controller.close();
    },
  });
}

/** 调用本地/外部 LLM，返回 SSE 流 */
async function callExternalLLMStream(
  messages: Array<{ role: string; content: string }>,
  sources: Array<{ title: string; url: string }>,
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

  // 透传 LLM 的 SSE 流，并在末尾注入 sources
  const stream = response.body ?? createSSEStream("");
  return wrapLLMStreamWithSources(stream, sources);
}

/** 调用 Cloudflare Workers AI，包装为 SSE 流 */
async function callWorkersAIStream(
  env: Record<string, unknown>,
  messages: Array<{ role: string; content: string }>,
  sources: Array<{ title: string; url: string }>,
): Promise<ReadableStream> {
  const ai = env.AI as {
    run(
      model: string,
      params: { messages: Array<{ role: string; content: string }> },
    ): Promise<{ response?: string; text?: string }>;
  };

  const result = await ai.run(WORKERS_AI_MODEL, { messages });
  let text = result.response ?? result.text ?? "";

  if (sources.length > 0) {
    text +=
      "\n\n---\n\n**参考文档：**\n" +
      sources.map((s) => `- [${s.title}](${s.url})`).join("\n");
  }

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

  const env = locals as unknown as Record<string, unknown>;
  const hasWorkersAI = env.AI && typeof env.AI === "object";

  // 使用 LLM 选择相关章节（最多5个），替代 TF-IDF 关键词检索
  const selected = await selectChaptersWithLLM(
    hasWorkersAI ? env : null,
    message,
    chapters,
  );

  const sources = selected.map((c) => ({ title: c.title, url: c.url }));
  const context = selected
    .map((c, i) => `[${i + 1}] ${c.title}\n来源：${c.url}\n${c.fullContent}`)
    .join("\n\n");

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
    "引用规范：当信息来自某个文档片段时，请在回答中使用 Markdown 链接格式标注来源，例如：[文件存储概述](/platform/oss/overview/)。\n\n" +
    "代码规范：当问题涉及 API 使用、配置或实现时，尽量直接给出可运行的参考代码示例，而不仅仅是文字描述。\n\n" +
    "=== 文档片段 ===\n" +
    context +
    "\n=== 文档片段结束 ===";

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: message },
  ];

  // 调试输出：打印完整请求上下文
  console.log("====== Ask AI Debug ======");
  console.log("用户问题:", message);
  console.log(
    "LLM 选中章节:",
    selected.map((c) => c.title),
  );
  console.log("完整 Prompt:");
  console.log(JSON.stringify(messages, null, 2));
  console.log("==========================");

  try {
    const stream =
      env.AI && typeof env.AI === "object"
        ? await callWorkersAIStream(env, messages, sources)
        : await callExternalLLMStream(messages, sources);

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

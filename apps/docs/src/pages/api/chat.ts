/**
 * RAG 问答 API Endpoint（支持 SSE 流式响应 + ReAct Tool Use）
 *
 * 部署到 Cloudflare Workers 时使用 Workers AI（免费）。
 * 本地开发时回退到 OPENAI_API_KEY 配置的外部 LLM。
 */

import type { APIRoute } from "astro";
import { createKnowledgeBase } from "@ventostack/ai";
import kbDataRaw from "./kb-data.json";

export const prerender = false;

/** Cloudflare Workers AI 模型 */
const WORKERS_AI_MODEL = "@cf/zai-org/glm-4.7-flash";

// 重建知识库，并在 content 中融入标题和描述以提升 TF-IDF 召回质量
const kbData = Array.isArray(kbDataRaw)
  ? kbDataRaw
  : (kbDataRaw as unknown as { default?: unknown[] }).default ?? [];
const kb = createKnowledgeBase();
for (const doc of kbData) {
  const raw = doc as { content: string; metadata?: Record<string, unknown> };
  const title = (raw.metadata?.title as string) || "";
  const desc = (raw.metadata?.description as string) || "";
  const enriched = title
    ? `${title}${desc ? "\n" + desc : ""}\n\n${raw.content}`
    : raw.content;
  kb.add({ ...raw, content: enriched });
}

interface ChatRequest {
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
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

function getEnv(key: string): string | undefined {
  const viteEnv = (import.meta.env as Record<string, string | undefined>)[key];
  if (viteEnv !== undefined) return viteEnv;
  return (process.env as Record<string, string | undefined>)[key];
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

  const result = await ai.run(env.WORKER_AI_MODEL as string || WORKERS_AI_MODEL, { messages });
  return result.response ?? result.text ?? "";
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

/** 精简 SSE 事件：只保留 delta.content / delta.reasoning */
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

/** 调用本地/外部 LLM 的原始 SSE 流（只 strip payload） */
async function callExternalLLMStreamRaw(
  messages: Array<{ role: string; content: string }>,
): Promise<ReadableStream> {
  const apiKey = getEnv("OPENAI_API_KEY");
  const baseURL = getEnv("OPENAI_BASE_URL") ?? "https://api.openai.com/v1";
  const model = getEnv("OPENAI_MODEL") ?? "gpt-4.1-nano";
  const encoder = new TextEncoder();

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
    return createSSEStream(
      `LLM API error ${response.status}: ${text.slice(0, 200)}`,
    );
  }

  const stream = response.body ?? createSSEStream("");
  return new ReadableStream({
    async start(controller) {
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split("\n\n");
          buffer = events.pop() || "";

          for (const event of events) {
            const dataMatch = event.match(/^data: (.+)$/m);
            if (!dataMatch) continue;
            const data = dataMatch[1];
            if (data === "[DONE]") {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            } else {
              const stripped = stripSSEPayload(data);
              controller.enqueue(
                encoder.encode(`data: ${stripped}\n\n`),
              );
            }
          }
        }

        if (buffer.trim()) {
          const dataMatch = buffer.match(/^data: (.+)$/m);
          if (dataMatch && dataMatch[1] === "[DONE]") {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          } else if (dataMatch) {
            const stripped = stripSSEPayload(dataMatch[1]);
            controller.enqueue(
              encoder.encode(`data: ${stripped}\n\n`),
            );
          }
        }
      } finally {
        reader.releaseLock();
      }
      controller.close();
    },
  });
}

const tools: ToolDef[] = [
  {
    name: "search_documents",
    description:
      "搜索 VentoStack 技术文档知识库，获取与用户问题相关的文档片段。",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "搜索关键词或问题描述，越具体越好",
        },
      },
      required: ["query"],
    },
  },
];

/** 从 knowledge base 搜索文档片段，限制总长度防止上下文溢出 */
async function executeSearchDocuments(
  query: string,
): Promise<{ sources: Array<{ title: string; url: string }>; context: string }> {
  const results = kb.search(query, 10);
  const minScore = 0.01;
  const filtered = results.filter((r) => r.score > minScore);

  const seenSources = new Map<string, { title: string; url: string }>();
  const chunks: string[] = [];
  let totalLen = 0;
  const MAX_CONTEXT = 6000;

  for (const r of filtered.slice(0, 8)) {
    const source = r.document.metadata?.source as string;
    const title = (r.document.metadata?.title as string) || "无标题";
    const url = docPathToUrl(source);

    if (!seenSources.has(url)) {
      seenSources.set(url, { title, url });
    }

    const chunkText = `[${chunks.length + 1}] ${title}\n来源：${url}\n${r.document.content}`;
    if (totalLen + chunkText.length > MAX_CONTEXT && chunks.length > 0) {
      break;
    }
    chunks.push(chunkText);
    totalLen += chunkText.length;
  }

  const sources = Array.from(seenSources.values());
  const context = chunks.join("\n\n") || "未找到相关文档。";

  return { sources, context };
}

/** 解析 planning 文本中的 tool_calls */
function parseToolCalls(text: string): { reasoning: string; toolCalls: ToolCall[] } {
  const toolCallRegex = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g;
  const toolCalls: ToolCall[] = [];
  let match: RegExpExecArray | null;
  while ((match = toolCallRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.name && tools.some((t) => t.name === parsed.name)) {
        toolCalls.push(parsed as ToolCall);
      }
    } catch {
      // 忽略解析失败的工具调用
    }
  }
  let reasoning = text.replace(toolCallRegex, "").trim();
  const MAX_REASONING = 600;
  if (reasoning.length > MAX_REASONING) {
    reasoning = reasoning.slice(0, MAX_REASONING) + "...";
  }
  return { reasoning, toolCalls };
}

export const POST: APIRoute = async ({ request }) => {
  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return new Response(
      JSON.stringify({ error: "请求体必须是有效的 JSON。" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { message, history = [] } = body;
  if (!message || typeof message !== "string") {
    return new Response(
      JSON.stringify({ error: "message 字段必填且为字符串。" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Astro v6 + Cloudflare adapter v13 中，locals 不再包含 Workers 绑定，
  // 需通过 cloudflare:workers 获取；本地开发（Node adapter）时回退到外部 LLM。
  let cfEnv: Record<string, unknown> = {};
  try {
    // @ts-expect-error cloudflare:workers 只在 Workers 运行时存在
    const mod = await import("cloudflare:workers");
    cfEnv = (mod.env ?? {}) as Record<string, unknown>;
  } catch {
    /* 本地开发或非 Workers 环境 */
  }
  const env = cfEnv;
  const hasWorkersAI = env.AI && typeof env.AI === "object";
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // 构造对话上下文（最近 4 条 + 当前消息）
        const recentHistory = history.slice(-4);
        const conversationMessages = [
          ...recentHistory.map((h) => ({
            role: h.role,
            content: h.content,
          })),
          { role: "user" as const, content: message },
        ];

        // ===== Phase 1: Planning（决定是否需要搜索） =====
        const toolDesc = tools
          .map((t) => `- ${t.name}: ${t.description}\n  参数: ${JSON.stringify(t.parameters)}`)
          .join("\n");

        const planningPrompt = [
          {
            role: "system",
            content:
              "你是 VentoStack 文档助手。请分析用户问题，决定是否需要搜索文档知识库来获取信息。\n\n" +
              `可用工具:\n${toolDesc}\n\n` +
              "输出格式：先输出简短思考过程，然后如需要搜索，输出工具调用块：\n" +
              '<tool_call>{"name":"search_documents","arguments":{"query":"搜索关键词"}}</tool_call>\n' +
              "注意：\n" +
              "- 如可直接回答（问候、简单确认），无需工具。\n" +
              "- 思考过程仅限用户意图识别和检索决策，禁止在思考中写代码、输出回答内容或示例。\n" +
              "- 思考保持简洁，最多调用 1 个工具。",
          },
          ...conversationMessages,
        ];

        let planningText = "";

        if (hasWorkersAI) {
          planningText = await callWorkersAI(env, planningPrompt);
        } else {
          const planningStream = await callExternalLLMStreamRaw(planningPrompt);
          const planningReader = planningStream.getReader();
          const planningDecoder = new TextDecoder();
          let pbuf = "";
          try {
            while (true) {
              const { done, value } = await planningReader.read();
              if (done) break;
              pbuf += planningDecoder.decode(value, { stream: true });
              const events = pbuf.split("\n\n");
              pbuf = events.pop() || "";
              for (const ev of events) {
                const m = ev.match(/^data: (.+)$/m);
                if (!m || m[1] === "[DONE]") continue;
                try {
                  const p = JSON.parse(m[1]);
                  const chunk = p.choices?.[0]?.delta?.content || p.choices?.[0]?.delta?.reasoning || "";
                  if (chunk) planningText += chunk;
                } catch {
                  /* ignore */
                }
              }
            }
          } finally {
            planningReader.releaseLock();
          }
        }

        const { reasoning, toolCalls } = parseToolCalls(planningText);
        if (reasoning) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ choices: [{ delta: { reasoning } }] })}\n\n`,
            ),
          );
        }

        // ===== Phase 2: 执行工具调用 =====
        const toolResultMessages: Array<{ role: "user"; content: string }> = [];
        const allSources: Array<{ title: string; url: string }> = [];

        for (const tc of toolCalls.slice(0, 1)) {
          const toolCallData = JSON.stringify({ tool_call: tc });
          controller.enqueue(encoder.encode(`data: ${toolCallData}\n\n`));

          if (tc.name === "search_documents") {
            const query = String(tc.arguments.query || "");
            const searchResult = await executeSearchDocuments(query);
            const result = {
              found: searchResult.sources.length,
              sources: searchResult.sources,
            };
            allSources.push(...searchResult.sources);
            toolResultMessages.push({
              role: "user",
              content:
                `[search_documents 结果] 找到 ${searchResult.sources.length} 篇相关文档，内容如下：\n` +
                searchResult.context,
            });

            const toolResultData = JSON.stringify({
              tool_result: { name: tc.name, result },
            });
            controller.enqueue(encoder.encode(`data: ${toolResultData}\n\n`));
          } else {
            const toolResultData = JSON.stringify({
              tool_result: { name: tc.name, result: { error: "未知工具" } },
            });
            controller.enqueue(encoder.encode(`data: ${toolResultData}\n\n`));
          }
        }

        // ===== Phase 3: 生成最终答案 =====
        const answerSystemPrompt =
          "你是 VentoStack 框架的技术文档助手。请严格基于提供的文档片段和工具结果回答用户问题。" +
          "如果文档中没有相关信息，明确告知用户。不要编造信息。回答应简洁、准确，使用中文。\n\n" +
          "引用规范：当信息来自某个文档片段时，请在回答中使用 Markdown 链接格式标注来源，例如：[文件存储概述](/platform/oss/overview/)。\n\n" +
          "代码规范：当问题涉及 API 使用、配置或实现时，尽量直接给出可运行的参考代码示例，而不仅仅是文字描述。";

        const finalMessages = [
          { role: "system" as const, content: answerSystemPrompt },
          ...recentHistory.slice(-2).map((h) => ({
            role: h.role,
            content: h.content,
          })),
          { role: "user" as const, content: message },
          ...toolResultMessages,
        ];

        if (hasWorkersAI) {
          const text = await callWorkersAI(env, finalMessages);
          for (let i = 0; i < text.length; i += 8) {
            const chunk = text.slice(i, i + 8);
            const data = JSON.stringify({
              choices: [{ delta: { content: chunk } }],
            });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            await new Promise((r) => setTimeout(r, 30));
          }
        } else {
          const llmStream = await callExternalLLMStreamRaw(finalMessages);
          const reader = llmStream.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          } finally {
            reader.releaseLock();
          }
        }

        // 在末尾注入 sources
        const uniqueSources = [
          ...new Map(allSources.map((s) => [s.url, s])).values(),
        ];
        if (uniqueSources.length > 0) {
          const sourcesPayload = JSON.stringify({
            choices: [{ delta: { content: "" } }],
            sources: uniqueSources,
          });
          controller.enqueue(
            encoder.encode(`data: ${sourcesPayload}\n\n`),
          );
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const data = JSON.stringify({
          choices: [{ delta: { content: `错误：${errorMsg}` } }],
        });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};

/**
 * RAG 文档智能体示例
 *
 * 将 apps/docs/src/content/docs/ 下的文档加载为知识库，
 * 通过 HTTP API 提供问答服务。
 *
 * 启动前需设置环境变量：OPENAI_API_KEY
 *
 * ```bash
 * OPENAI_API_KEY=sk-xxx bun --hot src/rag-server.ts
 * ```
 */

import {
  createAgentRegistry,
  createContextManager,
  createKnowledgeBase,
  createLLMClient,
  createRAGAgent,
  createSandbox,
  createToolRegistry,
  loadDocumentsFromDirectory,
} from "@ventostack/ai";
import { createApp, createRouter } from "@ventostack/core";

// ── 配置 ─────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 4000);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LLM_MODEL = process.env.LLM_MODEL ?? "gpt-4.1-nano";
const DOCS_PATH = process.env.DOCS_PATH ?? "../../docs/src/content/docs";

// ── 安全预检 ──────────────────────────────────────
if (!OPENAI_API_KEY) {
  console.error("Error: OPENAI_API_KEY environment variable is required");
  process.exit(1);
}

// ── 初始化组件 ────────────────────────────────────
const kb = createKnowledgeBase();
const ctxManager = createContextManager();
const toolRegistry = createToolRegistry();
const sandbox = createSandbox({
  allowNetworkAccess: true,
  allowedHosts: ["api.openai.com"],
});

const llm = createLLMClient({
  apiKey: OPENAI_API_KEY,
  model: LLM_MODEL,
  timeout: 30_000,
  temperature: 0.3,
});

// ── 加载文档到知识库 ──────────────────────────────
console.log(`Loading documents from ${DOCS_PATH}...`);
const loadResult = await loadDocumentsFromDirectory(DOCS_PATH, kb, {
  chunkSize: 800,
  overlap: 150,
});

console.log(`Loaded ${loadResult.loaded} documents, ${loadResult.chunks} chunks`);
if (loadResult.errors.length > 0) {
  console.warn("Load errors:", loadResult.errors);
}

// ── 创建 RAG 智能体 ───────────────────────────────
const docAgent = createRAGAgent(
  {
    knowledgeBase: kb,
    contextManager: ctxManager,
    llmClient: llm,
    toolRegistry,
    sandbox,
  },
  {
    name: "ventostack_docs_assistant",
    systemPrompt:
      "你是 VentoStack 框架的技术文档助手。基于提供的文档片段回答用户问题。" +
      "如果文档中没有相关信息，明确告知用户。不要编造信息。" +
      "回答应简洁、准确，使用中文。",
    topK: 5,
    maxHistory: 20,
  },
);

// ── 注册到智能体注册表 ────────────────────────────
const registry = createAgentRegistry();
registry.register({
  name: docAgent.name,
  systemPrompt: docAgent.systemPrompt,
  knowledgeBase: kb,
  memory: { shortTerm: true, maxItems: 20 },
});

// ── HTTP 路由 ─────────────────────────────────────
const router = createRouter();

// 健康检查
router.get("/health", async (ctx) => {
  return ctx.json({
    status: "ok",
    documents: kb.size(),
    activeConversations: ctxManager.listActive().length,
  });
});

// 问答端点
router.post("/chat", async (ctx) => {
  const body = (await ctx.request.json()) as {
    message: string;
    conversationId?: string;
  };

  if (!body.message || typeof body.message !== "string") {
    return ctx.json({ error: "message is required and must be a string" }, 400);
  }

  try {
    const result = await docAgent.chat(body.message, body.conversationId);

    return ctx.json({
      answer: result.answer,
      sources: result.sources,
      conversationId: result.conversationId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Chat error:", message);
    return ctx.json({ error: "Failed to generate response" }, 500);
  }
});

// 检索端点（无需 LLM，直接返回相关文档片段）
router.post("/search", async (ctx) => {
  const body = (await ctx.request.json()) as { query: string; limit?: number };

  if (!body.query || typeof body.query !== "string") {
    return ctx.json({ error: "query is required and must be a string" }, 400);
  }

  const results = kb.search(body.query, body.limit ?? 5);

  return ctx.json({
    query: body.query,
    results: results.map((r) => ({
      id: r.document.id,
      score: r.score,
      title: r.document.metadata?.title ?? "未命名",
      excerpt: r.document.content.slice(0, 300),
    })),
  });
});

// ── 启动服务 ──────────────────────────────────────
const app = createApp({ port: PORT });
app.use(router);
await app.listen();

console.log(`RAG docs agent running at http://localhost:${PORT}`);
console.log(`  POST /chat     - 问答对话`);
console.log(`  POST /search   - 文档检索`);
console.log(`  GET  /health   - 健康检查`);

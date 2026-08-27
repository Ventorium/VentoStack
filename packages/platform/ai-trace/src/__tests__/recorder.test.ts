/**
 * @ventostack/ai-trace - 链路记录器测试
 *
 * 用合成事件序列驱动 mock store，验证：
 * - span 序列 / 增量消息策略 / usage 累计 / 状态终态
 * - 开关关闭不落库、并发 run 隔离、工具分类
 */

import { describe, expect, test } from "bun:test";
import { createEventEmitter } from "@ventostack/ai";
import type { AgentEvent, AgentRunContext } from "@ventostack/ai";
import { createTraceRecorder, categorizeTool, parseMcpServerName } from "../services/recorder";
import type { TraceStore } from "../services/trace-store";
import type { TraceRecord, TraceSpan, TraceUpdateFields, SpanUpdateFields } from "../services/trace-store";

/** 记录所有调用的内存 store */
function createMockStore() {
  const traces = new Map<string, TraceRecord>();
  const traceUpdates = new Map<string, TraceUpdateFields[]>();
  const spans = new Map<string, TraceSpan>();
  const spanUpdates = new Map<string, SpanUpdateFields[]>();

  const store: TraceStore = {
    async insertTrace(record) {
      traces.set(record.id, { ...record });
    },
    async updateTrace(id, _tenantId, fields) {
      traceUpdates.set(id, [...(traceUpdates.get(id) ?? []), { ...fields }]);
    },
    async insertSpan(span) {
      spans.set(span.id, { ...span });
    },
    async updateSpan(id, _tenantId, fields) {
      spanUpdates.set(id, [...(spanUpdates.get(id) ?? []), { ...fields }]);
    },
    async getTrace() {
      return null;
    },
    async getTraceDetail() {
      return null;
    },
    async listConversations() {
      return { items: [], total: 0, page: 1, pageSize: 20 };
    },
    async listConversationMessages() {
      return [];
    },
    async markStaleTraces() {
      return 0;
    },
  };
  return { store, traces, traceUpdates, spans, spanUpdates };
}

function setup(enabled = true) {
  const mockStore = createMockStore();
  const emitter = createEventEmitter();
  const recorder = createTraceRecorder({
    emitter,
    store: mockStore.store,
    toggle: { isEnabled: async () => enabled },
  });
  recorder.start();
  const run = (over: Partial<AgentRunContext> = {}): AgentRunContext => ({
    runId: "run-1",
    sessionId: "conv-1",
    userId: "user-1",
    tenantId: "tenant-1",
    ...over,
  });
  async function emit(event: AgentEvent): Promise<void> {
    await emitter.emit(event);
  }
  return { recorder, ...mockStore, run, emit };
}

/** 完整多轮对话序列：turn1（工具调用）→ turn2（最终回复） */
async function emitFullRun(ctx: ReturnType<typeof setup>): Promise<void> {
  await ctx.emit({
    type: "agent_start",
    run: ctx.run(),
    meta: {
      model: "gpt-4o",
      maxIterations: 10,
      userMessage: "帮我查知识库",
      skillIds: ["skill-1"],
      knowledgeBaseIds: ["kb-1"],
      toolNames: ["kb-search"],
    },
  });
  await ctx.emit({
    type: "context",
    run: ctx.run(),
    systemPrompt: "You are helpful.",
    messages: [{ role: "user", content: "帮我查知识库", timestamp: 1 }],
  });
  // Turn 1: LLM 返回 tool_calls
  await ctx.emit({ type: "turn_start", run: ctx.run() });
  await ctx.emit({ type: "before_provider_request", run: ctx.run(), model: "gpt-4o", messageCount: 2 });
  await ctx.emit({
    type: "message_end",
    run: ctx.run(),
    message: {
      role: "assistant",
      content: "",
      toolCalls: [{ id: "call-1", name: "kb-search", arguments: { query: "测试" } }],
      usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
      model: "gpt-4o",
      provider: "openai",
      stopReason: "tool_calls",
      timestamp: 2,
    },
  });
  // 工具执行
  await ctx.emit({
    type: "tool_execution_start",
    run: ctx.run(),
    toolCallId: "call-1",
    toolName: "kb-search",
    args: { query: "测试" },
  });
  await ctx.emit({
    type: "tool_execution_end",
    run: ctx.run(),
    toolCallId: "call-1",
    toolName: "kb-search",
    result: "搜索到 3 条结果",
    isError: false,
  });
  // 工具结果消息（agent-loop 会在 tool_execution_end 后发出 tool 角色的 message_end）
  await ctx.emit({
    type: "message_end",
    run: ctx.run(),
    message: { role: "tool", content: "搜索到 3 条结果", toolCallId: "call-1", timestamp: 3 },
  });
  // Turn 2: LLM 最终回复
  await ctx.emit({ type: "turn_start", run: ctx.run() });
  await ctx.emit({ type: "before_provider_request", run: ctx.run(), model: "gpt-4o", messageCount: 4 });
  await ctx.emit({
    type: "message_end",
    run: ctx.run(),
    message: {
      role: "assistant",
      content: "根据知识库，答案是 42。",
      usage: { promptTokens: 200, completionTokens: 50, totalTokens: 250 },
      model: "gpt-4o",
      provider: "openai",
      stopReason: "stop",
      timestamp: 3,
    },
  });
  await ctx.emit({
    type: "agent_end",
    run: ctx.run(),
    messages: [{ role: "assistant", content: "根据知识库，答案是 42。", timestamp: 4 }],
  });
}

describe("TraceRecorder", () => {
  test("完整多轮运行：trace + 3 个 span（2 llm + 1 tool）按序落库", async () => {
    const ctx = setup();
    await emitFullRun(ctx);

    const trace = ctx.traces.get("run-1");
    expect(trace).toBeDefined();
    expect(trace!.status).toBe("running");
    expect(trace!.userMessage).toBe("帮我查知识库");
    expect(trace!.meta?.knowledgeBaseIds).toEqual(["kb-1"]);

    // finalize：状态与指标
    const finalize = ctx.traceUpdates.get("run-1")!.at(-1)!;
    expect(finalize.status).toBe("success");
    expect(finalize.turnCount).toBe(2);
    expect(finalize.toolCount).toBe(1);
    expect(finalize.usage).toEqual({ promptTokens: 300, completionTokens: 70, totalTokens: 370 });
    expect(finalize.assistantPreview).toBe("根据知识库，答案是 42。");

    // span 序列：llm(1) + tool(2) + llm(3)
    const spanList = [...ctx.spans.values()].sort((a, b) => a.seq - b.seq);
    expect(spanList).toHaveLength(3);
    expect(spanList.map((s) => s.spanType)).toEqual(["llm", "tool", "llm"]);
    expect(spanList[0]!.name).toBe("gpt-4o");
    expect(spanList[1]!.name).toBe("kb-search");
    expect(spanList[1]!.category).toBe("knowledge_base");
    expect(spanList[1]!.input).toMatchObject({ args: { query: "测试" } });
    expect(spanList[2]!.turnIndex).toBe(2);
  });

  test("增量消息：首轮 LLM span 含用户消息，次轮含上轮 assistant 输出", async () => {
    const ctx = setup();
    await emitFullRun(ctx);

    const spanList = [...ctx.spans.values()].sort((a, b) => a.seq - b.seq);
    const firstLlmInput = spanList[0]!.input as { newMessages: Array<{ role: string }> };
    expect(firstLlmInput.newMessages).toHaveLength(1);
    expect(firstLlmInput.newMessages[0]!.role).toBe("user");

    // 次轮增量 = 上轮 assistant（带 toolCalls）+ 工具结果
    const secondLlmInput = spanList[2]!.input as { newMessages: Array<{ role: string }> };
    expect(secondLlmInput.newMessages.map((m) => m.role)).toEqual(["assistant", "tool"]);
  });

  test("LLM span 关闭时写 output（content/stopReason/usage/provider）", async () => {
    const ctx = setup();
    await emitFullRun(ctx);

    const llmSpanIds = [...ctx.spans.values()].filter((s) => s.spanType === "llm").map((s) => s.id);
    const lastLlmUpdate = ctx.spanUpdates.get(llmSpanIds.at(-1)!)!.at(-1)!;
    expect(lastLlmUpdate.status).toBe("success");
    expect(lastLlmUpdate.output).toMatchObject({
      content: "根据知识库，答案是 42。",
      stopReason: "stop",
      provider: "openai",
    });
  });

  test("开关关闭：不写 trace/span，终止事件正常清理 buffer", async () => {
    const ctx = setup(false);
    await emitFullRun(ctx);

    expect(ctx.traces.size).toBe(0);
    expect(ctx.spans.size).toBe(0);
    expect(ctx.recorder.activeRuns()).toBe(0);
  });

  test("error 事件：finalize 为 error 并记录错误信息", async () => {
    const ctx = setup();
    await ctx.emit({ type: "agent_start", run: ctx.run() });
    await ctx.emit({
      type: "error",
      run: ctx.run(),
      error: { code: "PROVIDER_ERROR", message: "rate limited", recoverable: false },
    });

    const finalize = ctx.traceUpdates.get("run-1")!.at(-1)!;
    expect(finalize.status).toBe("error");
    expect(finalize.error).toContain("PROVIDER_ERROR");
    expect(ctx.recorder.activeRuns()).toBe(0);
  });

  test("abort 事件：finalize 为 aborted", async () => {
    const ctx = setup();
    await ctx.emit({ type: "agent_start", run: ctx.run() });
    await ctx.emit({ type: "abort", run: ctx.run(), clearedMessages: [] });

    const finalize = ctx.traceUpdates.get("run-1")!.at(-1)!;
    expect(finalize.status).toBe("aborted");
  });

  test("settled 兜底：事件丢失时标记 success", async () => {
    const ctx = setup();
    await ctx.emit({ type: "agent_start", run: ctx.run() });
    await ctx.emit({ type: "settled", run: ctx.run() });

    const finalize = ctx.traceUpdates.get("run-1")!.at(-1)!;
    expect(finalize.status).toBe("success");
    expect(ctx.recorder.activeRuns()).toBe(0);
  });

  test("并发 run 隔离：不同 runId 的事件互不干扰", async () => {
    const ctx = setup();
    const runA = ctx.run({ runId: "run-a" });
    const runB = ctx.run({ runId: "run-b" });

    await ctx.emit({ type: "agent_start", run: runA, meta: { model: "model-a" } });
    await ctx.emit({ type: "agent_start", run: runB, meta: { model: "model-b" } });
    await ctx.emit({ type: "agent_end", run: runA, messages: [] });
    await ctx.emit({ type: "agent_end", run: runB, messages: [] });

    expect(ctx.traces.get("run-a")!.model).toBe("model-a");
    expect(ctx.traces.get("run-b")!.model).toBe("model-b");
    expect(ctx.traceUpdates.get("run-a")!.at(-1)!.status).toBe("success");
    expect(ctx.traceUpdates.get("run-b")!.at(-1)!.status).toBe("success");
  });

  test("无 run 上下文的事件被忽略", async () => {
    const ctx = setup();
    await ctx.emit({ type: "turn_start" });
    await ctx.emit({ type: "before_provider_request", model: "x", messageCount: 1 });

    expect(ctx.traces.size).toBe(0);
    expect(ctx.spans.size).toBe(0);
  });

  test("context 事件回写 systemPrompt", async () => {
    const ctx = setup();
    await ctx.emit({ type: "agent_start", run: ctx.run() });
    await ctx.emit({
      type: "context",
      run: ctx.run(),
      systemPrompt: "SYSTEM",
      messages: [],
    });

    const updates = ctx.traceUpdates.get("run-1")!;
    expect(updates.some((u) => u.systemPrompt === "SYSTEM")).toBe(true);
  });

  test("tools_added 追加工具名到 meta", async () => {
    const ctx = setup();
    await ctx.emit({ type: "agent_start", run: ctx.run() });
    await ctx.emit({
      type: "tools_added",
      run: ctx.run(),
      toolNames: ["mcp_github_issue"],
      previousToolNames: [],
    });

    const updates = ctx.traceUpdates.get("run-1")!;
    expect(updates.some((u) => u.appendToolNames?.includes("mcp_github_issue"))).toBe(true);
  });

  test("工具执行失败：span 状态为 error", async () => {
    const ctx = setup();
    await ctx.emit({ type: "agent_start", run: ctx.run() });
    await ctx.emit({
      type: "tool_execution_start",
      run: ctx.run(),
      toolCallId: "c1",
      toolName: "mcp_github_issue",
      args: {},
    });
    await ctx.emit({
      type: "tool_execution_end",
      run: ctx.run(),
      toolCallId: "c1",
      toolName: "mcp_github_issue",
      result: "boom",
      isError: true,
    });

    const span = [...ctx.spans.values()][0]!;
    expect(span.category).toBe("mcp");
    expect(span.input).toMatchObject({ mcpServer: "github" });
    const update = ctx.spanUpdates.get(span.id)!.at(-1)!;
    expect(update.status).toBe("error");
  });

  test("steering 注入的用户消息进入下一轮 LLM 增量", async () => {
    const ctx = setup();
    await ctx.emit({ type: "agent_start", run: ctx.run() });
    await ctx.emit({ type: "before_provider_request", run: ctx.run(), model: "gpt-4o", messageCount: 2 });
    await ctx.emit({
      type: "message_end",
      run: ctx.run(),
      message: {
        role: "assistant",
        content: "请补充",
        stopReason: "stop",
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      },
    });
    // steering：运行中追加的用户消息
    await ctx.emit({
      type: "message_end",
      run: ctx.run(),
      message: { role: "user", content: "补充信息" },
    });
    await ctx.emit({ type: "before_provider_request", run: ctx.run(), model: "gpt-4o", messageCount: 3 });

    const spanList = [...ctx.spans.values()].sort((a, b) => a.seq - b.seq);
    const secondInput = spanList.at(-1)!.input as { newMessages: Array<{ role: string; content: string }> };
    expect(secondInput.newMessages.map((m) => m.role)).toEqual(["assistant", "user"]);
    expect(secondInput.newMessages[1]!.content).toBe("补充信息");
  });

  test("未关闭的 LLM span 在下一轮请求前兜底关闭为 error", async () => {
    const ctx = setup();
    await ctx.emit({ type: "agent_start", run: ctx.run() });
    await ctx.emit({ type: "before_provider_request", run: ctx.run(), model: "gpt-4o", messageCount: 1 });
    await ctx.emit({ type: "before_provider_request", run: ctx.run(), model: "gpt-4o", messageCount: 2 });

    const spanList = [...ctx.spans.values()].sort((a, b) => a.seq - b.seq);
    expect(spanList).toHaveLength(2);
    const firstUpdates = ctx.spanUpdates.get(spanList[0]!.id)!;
    expect(firstUpdates.at(-1)!.status).toBe("error");
    expect(firstUpdates.at(-1)!.error).toBe("LLM 流提前终止");
  });

  test("超出 maxBufferedMessages 时丢弃最旧增量消息", async () => {
    const mockStore = createMockStore();
    const emitter = createEventEmitter();
    const recorder = createTraceRecorder({
      emitter,
      store: mockStore.store,
      toggle: { isEnabled: async () => true },
      maxBufferedMessages: 2,
    });
    recorder.start();
    const run: AgentRunContext = { runId: "run-mb", sessionId: "conv", userId: "u", tenantId: "t" };
    await emitter.emit({ type: "agent_start", run });
    for (const content of ["a", "b", "c"]) {
      await emitter.emit({ type: "message_end", run, message: { role: "user", content } });
    }
    await emitter.emit({ type: "before_provider_request", run, model: "m", messageCount: 4 });
    recorder.stop();

    const span = [...mockStore.spans.values()][0]!;
    const input = span.input as { newMessages: Array<{ content: string }> };
    expect(input.newMessages).toHaveLength(2);
    expect(input.newMessages.map((m) => m.content)).toEqual(["b", "c"]);
  });

  test("开关读取异常时按关闭处理（不落库、可清理）", async () => {
    const mockStore = createMockStore();
    const emitter = createEventEmitter();
    const recorder = createTraceRecorder({
      emitter,
      store: mockStore.store,
      toggle: {
        isEnabled: async () => {
          throw new Error("db down");
        },
      },
    });
    recorder.start();
    const run: AgentRunContext = { runId: "run-err", sessionId: "conv", userId: "u", tenantId: "t" };
    await emitter.emit({ type: "agent_start", run });
    await emitter.emit({ type: "agent_end", run, messages: [] });
    recorder.stop();

    expect(mockStore.traces.size).toBe(0);
    expect(recorder.activeRuns()).toBe(0);
  });

  test("finalize 兜底关闭未闭合的工具 span", async () => {
    const ctx = setup();
    await ctx.emit({ type: "agent_start", run: ctx.run() });
    await ctx.emit({
      type: "tool_execution_start",
      run: ctx.run(),
      toolCallId: "c1",
      toolName: "kb-search",
      args: {},
    });
    await ctx.emit({ type: "abort", run: ctx.run(), clearedMessages: [] });

    const span = [...ctx.spans.values()][0]!;
    const update = ctx.spanUpdates.get(span.id)!.at(-1)!;
    expect(update.status).toBe("aborted");
    expect(ctx.recorder.activeRuns()).toBe(0);
  });
});

describe("工具分类", () => {
  test("categorizeTool 按前缀分类", () => {
    expect(categorizeTool("kb-search")).toBe("knowledge_base");
    expect(categorizeTool("mcp_github_issue")).toBe("mcp");
    expect(categorizeTool("web_search")).toBe("builtin");
  });

  test("parseMcpServerName 解析 server 名", () => {
    expect(parseMcpServerName("mcp_github_issue")).toBe("github");
    expect(parseMcpServerName("kb-search")).toBeNull();
    expect(parseMcpServerName("mcp_")).toBeNull();
  });
});

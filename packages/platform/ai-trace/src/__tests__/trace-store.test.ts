/**
 * @ventostack/ai-trace - 链路落库与查询服务测试
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { truncateJson } from "../services/trace-mappers";
import { createTraceStore } from "../services/trace-store";
import { createMockDatabase, createMockExecutor } from "./helpers";

function setup() {
  const mockExec = createMockExecutor();
  const { db } = createMockDatabase(mockExec);
  const store = createTraceStore({ db });
  return { store, calls: mockExec.calls, results: mockExec.results };
}

describe("truncateJson", () => {
  test("截断超长字符串", () => {
    const long = "a".repeat(9000);
    const result = truncateJson({ text: long }) as { text: string };
    expect(result.text.length).toBeLessThan(8100);
    expect(result.text.endsWith("...[截断]")).toBe(true);
  });

  test("深度截断", () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: "x" } } } } } } };
    const result = JSON.stringify(truncateJson(deep));
    expect(result).toContain("深度截断");
  });

  test("原样返回基本类型", () => {
    expect(truncateJson(42)).toBe(42);
    expect(truncateJson(null)).toBe(null);
    expect(truncateJson("short")).toBe("short");
  });
});

describe("TraceStore", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  test("insertTrace 写入 ai_trace 且 payload 序列化", async () => {
    await s.store.insertTrace({
      id: "t1",
      conversationId: "c1",
      agentId: "a1",
      sessionId: "c1",
      userId: "u1",
      tenantId: "ten1",
      status: "running",
      userMessage: "你好",
      assistantPreview: null,
      systemPrompt: "SYS",
      model: "gpt-4o",
      meta: { knowledgeBaseIds: ["kb1"] },
      usage: null,
      error: null,
      turnCount: 0,
      toolCount: 0,
      durationMs: null,
      startedAt: new Date().toISOString(),
      endedAt: null,
    });

    const insert = s.calls.find((c) => c.text.includes("INSERT INTO ai_trace"));
    expect(insert).toBeDefined();
    expect(insert!.params![5]).toBe("ten1");
    expect(String(insert!.params![11])).toContain("kb1");
  });

  test("insertSpan 写入 ai_trace_span", async () => {
    await s.store.insertSpan({
      id: "s1",
      traceId: "t1",
      tenantId: "ten1",
      seq: 1,
      turnIndex: 1,
      spanType: "tool",
      name: "kb-search",
      category: "knowledge_base",
      status: "running",
      input: { args: { q: "x" } },
      output: null,
      error: null,
      startedAt: new Date().toISOString(),
      endedAt: null,
      durationMs: null,
    });

    const insert = s.calls.find((c) => c.text.includes("INSERT INTO ai_trace_span"));
    expect(insert).toBeDefined();
    expect(insert!.params![1]).toBe("t1");
    expect(String(insert!.params![9])).toContain("args");
  });

  test("updateTrace 动态 SET 并强制 tenant_id 条件", async () => {
    await s.store.updateTrace("t1", "ten1", { status: "success", turnCount: 2, toolCount: 1 });

    const update = s.calls.find((c) => c.text.includes("UPDATE ai_trace"));
    expect(update).toBeDefined();
    expect(update!.text).toContain("tenant_id = $2");
    expect(update!.params).toContain("success");
  });

  test("updateTrace appendToolNames 使用 jsonb_set 合并", async () => {
    await s.store.updateTrace("t1", "ten1", { appendToolNames: ["mcp_x"] });

    const update = s.calls.find((c) => c.text.includes("jsonb_set"));
    expect(update).toBeDefined();
    expect(update!.text).toContain("{toolNames}");
  });

  test("updateSpan 按 id + tenant_id 更新", async () => {
    await s.store.updateSpan("s1", "ten1", { status: "error", error: "boom" });

    const update = s.calls.find((c) => c.text.includes("UPDATE ai_trace_span"));
    expect(update).toBeDefined();
    expect(update!.text).toContain("WHERE id = $1 AND tenant_id = $2");
  });

  test("getTrace 强制租户条件并映射 camelCase", async () => {
    s.results.set("SELECT", [
      {
        id: "t1",
        conversation_id: "c1",
        user_id: "u1",
        tenant_id: "ten1",
        status: "success",
        turn_count: 2,
        tool_count: 1,
        started_at: new Date("2026-01-01T00:00:00Z"),
        ended_at: null,
        duration_ms: null,
      },
    ]);

    const trace = await s.store.getTrace("t1", "ten1");
    const select = s.calls.find((c) => c.text.includes("FROM ai_trace WHERE"));
    expect(select!.text).toContain("tenant_id = $2");
    expect(trace!.conversationId).toBe("c1");
    expect(trace!.turnCount).toBe(2);
    expect(trace!.startedAt).toContain("2026-01-01");
  });

  test("getTraceDetail spans 按 seq 排序", async () => {
    s.results.set("FROM ai_trace WHERE", [
      { id: "t1", tenant_id: "ten1", status: "success", started_at: new Date() },
    ]);
    s.results.set("FROM ai_trace_span", [
      { id: "s2", trace_id: "t1", seq: 2, span_type: "llm", name: "gpt", category: "llm", status: "success", started_at: new Date() },
      { id: "s1", trace_id: "t1", seq: 1, span_type: "tool", name: "kb", category: "knowledge_base", status: "success", started_at: new Date() },
    ]);

    const detail = await s.store.getTraceDetail("t1", "ten1");
    expect(detail!.spans).toHaveLength(2);
    expect(detail!.spans[0]!.seq).toBe(2); // mock 原样返回；SQL 已带 ORDER BY seq
    const spanSelect = s.calls.find((c) => c.text.includes("ORDER BY seq ASC"));
    expect(spanSelect).toBeDefined();
  });

  test("getTraceDetail trace 不存在时返回 null", async () => {
    const detail = await s.store.getTraceDetail("nope", "ten1");
    expect(detail).toBeNull();
  });

  test("listConversations 聚合查询 + 会话标题补齐", async () => {
    s.results.set("COUNT(DISTINCT", [{ cnt: 2 }]);
    s.results.set("GROUP BY", [
      {
        id: "c1",
        agent_id: "a1",
        user_id: "u1",
        tenant_id: "ten1",
        trace_count: 3,
        total_tokens: 1200,
        last_trace_at: new Date("2026-01-02T00:00:00Z"),
      },
    ]);
    s.results.set("FROM ai_conversation", [{ id: "c1", title: "测试会话", message_count: 6 }]);

    const result = await s.store.listConversations({ tenantId: "ten1", page: 1, pageSize: 20 });
    expect(result.total).toBe(2);
    expect(result.items[0]!.title).toBe("测试会话");
    expect(result.items[0]!.traceCount).toBe(3);
    expect(result.items[0]!.totalTokens).toBe(1200);

    const aggSql = s.calls.find((c) => c.text.includes("GROUP BY t.conversation_id"));
    expect(aggSql).toBeDefined();
    expect(aggSql!.text).toContain("t.tenant_id = $1");

    // 会话标题补齐查询同样带租户过滤
    const convSql = s.calls.find((c) => c.text.includes("FROM ai_conversation"));
    expect(convSql).toBeDefined();
    expect(convSql!.text).toContain("tenant_id = $2");
    expect(convSql!.params![1]).toBe("ten1");
  });

  test("listConversations 过滤条件注入", async () => {
    s.results.set("COUNT(DISTINCT", [{ cnt: 0 }]);
    await s.store.listConversations({
      tenantId: "ten1",
      agentId: "a1",
      userId: "u1",
      keyword: "测试",
      startTime: "2026-01-01T00:00:00Z",
    });

    const countSql = s.calls.find((c) => c.text.includes("COUNT(DISTINCT"));
    expect(countSql!.text).toContain("t.agent_id = $2");
    expect(countSql!.text).toContain("t.user_id = $3");
    expect(countSql!.text).toContain("ILIKE $5");
    expect(countSql!.text).toContain("t.started_at >= $4");
  });

  test("listConversationMessages 按会话 + 租户查询", async () => {
    s.results.set("FROM ai_trace", [
      {
        id: "t1",
        user_message: "问",
        assistant_preview: "答",
        status: "success",
        model: "gpt-4o",
        turn_count: 1,
        tool_count: 0,
        usage: { totalTokens: 100 },
        duration_ms: 500,
        started_at: new Date("2026-01-01T00:00:00Z"),
      },
    ]);

    const messages = await s.store.listConversationMessages("c1", "ten1");
    expect(messages[0]!.userMessage).toBe("问");
    expect(messages[0]!.assistantPreview).toBe("答");
    // 取最近 N 条后反转回时间正序
    const sql = s.calls.find((c) => c.text.includes("ORDER BY started_at DESC"));
    expect(sql).toBeDefined();
    expect(sql!.text).toContain("conversation_id = $1");
    expect(sql!.text).toContain("tenant_id = $2");
  });

  test("listConversations keyword 截断至 100 字符", async () => {
    s.results.set("COUNT(DISTINCT", [{ cnt: 0 }]);
    await s.store.listConversations({ tenantId: "ten1", keyword: "x".repeat(500) });

    const countSql = s.calls.find((c) => c.text.includes("COUNT(DISTINCT"));
    const likeParam = countSql!.params!.at(-1) as string;
    expect(likeParam.length).toBeLessThanOrEqual(102); // % + 100 + %
  });

  test("markStaleTraces 更新 running → interrupted 并清理残留 span", async () => {
    s.results.set("RETURNING id", [{ id: "t1" }, { id: "t2" }]);

    const count = await s.store.markStaleTraces(3600_000);
    expect(count).toBe(2);
    const traceSql = s.calls.find((c) => c.text.includes("RETURNING id"));
    expect(traceSql!.text).toContain("status = 'running'");
    expect(traceSql!.text).toContain("started_at < $1");

    const spanSql = s.calls.find((c) => c.text.includes("UPDATE ai_trace_span"));
    expect(spanSql).toBeDefined();
    expect(spanSql!.text).toContain("trace_id IN ($1, $2)");
    expect(spanSql!.params).toEqual(["t1", "t2"]);
  });
});

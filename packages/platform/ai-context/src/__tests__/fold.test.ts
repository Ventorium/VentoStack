import { describe, expect, test } from "bun:test";
import type { AgentEvent, AgentEventMessage } from "@ventostack/ai";
import { applyEvent, createFoldState } from "../services/fold";
import type { RequestInsert, ContextEventInsert, FoldNode } from "../services/fold-types";

function msg(partial: Partial<AgentEventMessage> & { role: AgentEventMessage["role"]; content: string }): AgentEventMessage {
  return { timestamp: Date.now(), ...partial };
}

function run(state: ReturnType<typeof createFoldState>, ...events: AgentEvent[]) {
  let s = state;
  const ops = [];
  for (const e of events) {
    const r = applyEvent(s, e);
    s = r.state;
    ops.push(...r.ops);
  }
  return { state: s, ops };
}

describe("上下文折叠器", () => {
  describe("context：初始系统提示与首轮消息", () => {
    test("系统提示进入 systemTokens 信封，不计入消息面", () => {
      const { state, ops } = run(createFoldState(), {
        type: "context",
        messages: [msg({ role: "user", content: "你好，世界" })],
        systemPrompt: "你是一个助手。".repeat(10),
      });

      expect(state.systemTokens).toBeGreaterThan(0);
      // 消息面只有 user，不含 system
      expect(state.sums.user).toBeGreaterThan(0);
      expect(state.sums.inject).toBe(0);
      expect(state.sums.assistant).toBe(0);
      // 系统节点是 system 分类
      const sysNode = ops.find((o) => o.kind === "insertNode" && o.node.category === "system");
      expect(sysNode).toBeDefined();
    });

    test("首轮用户消息计入 humanInputs 与 title", () => {
      const { state } = run(createFoldState(), {
        type: "context",
        messages: [msg({ role: "user", content: "帮我写个函数" })],
        systemPrompt: "x",
      });
      expect(state.humanInputs).toBe(1);
      expect(state.title).toBe("帮我写个函数");
    });
  });

  describe("before_provider_request：请求快照", () => {
    test("快照在新响应进入前拍，total 等于七项和", () => {
      let state = createFoldState();
      state = applyEvent(state, {
        type: "context",
        messages: [msg({ role: "user", content: "问题" })],
        systemPrompt: "系统",
      }).state;
      state = applyEvent(state, { type: "turn_start" }).state;

      const { ops } = run(state, {
        type: "before_provider_request",
        model: "deepseek-chat",
      });

      const req = ops.find((o) => o.kind === "insertRequest") as { request: RequestInsert };
      expect(req.request.model).toBe("deepseek-chat");
      expect(req.request.total).toBe(
        req.request.system +
          req.request.tools +
          req.request.user +
          req.request.inject +
          req.request.skill +
          req.request.assistant +
          req.request.tool,
      );
    });

    test("每次请求快照随消息面增长而增大", () => {
      let state = createFoldState();
      state = applyEvent(state, {
        type: "context",
        messages: [msg({ role: "user", content: "第一问" })],
        systemPrompt: "s",
      }).state;

      const r1 = run(state, { type: "before_provider_request", model: "m" });
      const req1 = r1.ops.find((o) => o.kind === "insertRequest") as { request: RequestInsert };

      // 追加一条 assistant 消息后再请求
      const r2 = run(r1.state, {
        type: "message_end",
        message: msg({ role: "assistant", content: "回答" }),
      });
      const r3 = run(r2.state, { type: "before_provider_request", model: "m" });
      const req3 = r3.ops.find((o) => o.kind === "insertRequest") as { request: RequestInsert };

      expect(req3.request.assistant).toBeGreaterThan(0);
      expect(req3.request.total).toBeGreaterThan(req1.request.total);
    });
  });

  describe("message_end：消息进入活跃面", () => {
    test("assistant 消息计入 answers 与 usage", () => {
      const { state } = run(createFoldState(), {
        type: "message_end",
        message: msg({
          role: "assistant",
          content: "这是回答",
          usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
        }),
      });
      expect(state.answers).toBe(1);
      expect(state.usage.uncached).toBe(100);
      expect(state.usage.output).toBe(20);
    });

    test("空回复不计入 answers", () => {
      const { state } = run(createFoldState(), {
        type: "message_end",
        message: msg({ role: "assistant", content: "   " }),
      });
      expect(state.answers).toBe(0);
    });

    test("工具结果中的技能内容重分类为 skill", () => {
      const { ops } = run(createFoldState(), {
        type: "message_end",
        message: msg({
          role: "tool",
          content: '<skill_content name="pdf-inspector">技能正文</skill_content>',
        }),
      });
      const node = ops.find((o) => o.kind === "insertNode") as { node: FoldNode };
      expect(node.node.category).toBe("skill");
      expect(node.node.name).toBe("pdf-inspector");
    });

    test("普通工具结果归为 tool", () => {
      const { ops } = run(createFoldState(), {
        type: "message_end",
        message: msg({ role: "tool", content: "文件内容" }),
      });
      const node = ops.find((o) => o.kind === "insertNode") as { node: FoldNode };
      expect(node.node.category).toBe("tool");
    });
  });

  describe("abort：压缩归档", () => {
    test("压缩移出最旧节点并打归档，delta 为负", () => {
      let state = createFoldState();
      state = applyEvent(state, {
        type: "context",
        messages: [msg({ role: "user", content: "问1" })],
        systemPrompt: "s",
      }).state;
      state = applyEvent(state, {
        type: "message_end",
        message: msg({ role: "assistant", content: "答1" }),
      }).state;
      const beforeTotal = state.sums.user + state.sums.assistant;

      const { ops } = run(state, { type: "abort", clearedMessages: [msg({ role: "user", content: "问1" })] });

      const archive = ops.find((o) => o.kind === "archiveNodes") as { ids: string[] };
      const event = ops.find((o) => o.kind === "insertEvent") as { event: ContextEventInsert };
      expect(archive.ids.length).toBe(1);
      expect(event.event.kind).toBe("compact");
      expect(event.event.deltaTokens).toBeLessThan(0);

      const after = createFoldState();
      expect(beforeTotal).toBeGreaterThan(0);
      expect(after.sums.user).toBe(0);
    });

    test("系统提示不被压缩移走（信封不参与）", () => {
      let state = createFoldState();
      state = applyEvent(state, {
        type: "context",
        messages: [msg({ role: "user", content: "问" })],
        systemPrompt: "系统",
      }).state;

      const { state: after } = run(state, {
        type: "abort",
        clearedMessages: [msg({ role: "user", content: "问" })],
      });
      expect(after.systemTokens).toBeGreaterThan(0);
    });
  });

  describe("tools_added：工具注入", () => {
    test("新增工具产生 inject 事件", () => {
      const { ops } = run(createFoldState(), {
        type: "tools_added",
        toolNames: ["bash", "read"],
        previousToolNames: [],
      });
      const event = ops.find((o) => o.kind === "insertEvent") as { event: ContextEventInsert };
      expect(event.event.kind).toBe("inject");
      expect(event.event.producer).toBe("tools");
    });

    test("空工具列表不产生事件", () => {
      const { ops } = run(createFoldState(), {
        type: "tools_added",
        toolNames: [],
        previousToolNames: ["x"],
      });
      expect(ops.filter((o) => o.kind === "insertEvent").length).toBe(0);
    });
  });

  describe("all-or-nothing：异常事件不破坏状态", () => {
    test("缺失 run 上下文的事件被安全忽略", () => {
      const state = createFoldState();
      const { state: after, ops } = run(state, {
        type: "message_end",
        message: undefined as unknown as AgentEventMessage,
      });
      // 不抛异常，状态保持可继续折叠
      expect(after).toBeDefined();
      expect(Array.isArray(ops)).toBe(true);
    });
  });
});
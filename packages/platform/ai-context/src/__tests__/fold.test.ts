import { describe, expect, test } from "bun:test";
import type { AgentEvent, AgentEventMessage } from "@ventostack/ai";
import { applyEvent, createFoldState } from "../services/fold";
import type { RequestInsert, ContextEventInsert, FoldNode } from "../services/fold-types";

function msg(partial: Partial<AgentEventMessage> & { role: AgentEventMessage["role"]; content: string }): AgentEventMessage {
  return { timestamp: Date.now(), ...partial };
}

/**
 * 依次应用事件；末尾可选的数字作为这些事件的墙钟时刻（用于验证请求耗时回填）。
 */
function run(state: ReturnType<typeof createFoldState>, ...args: Array<AgentEvent | number>) {
  let s = state;
  const ops = [];
  const tail = args[args.length - 1];
  const now = typeof tail === "number" ? (args.pop() as number) : undefined;
  for (const e of args as AgentEvent[]) {
    const r = now === undefined ? applyEvent(s, e) : applyEvent(s, e, now);
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

  describe("context：重放整段上下文的构成", () => {
    test("历史里的 assistant / tool 消息也计入消息面（否则上下文总量远小于实际）", () => {
      const { state, ops } = run(createFoldState(), {
        type: "context",
        messages: [
          msg({ role: "system", content: "系统提示" }),
          msg({ role: "user", content: "第一问" }),
          msg({ role: "assistant", content: "第一答" }),
          msg({ role: "tool", content: "工具结果内容" }),
          msg({ role: "user", content: "第二问" }),
        ],
        systemPrompt: "系统提示",
      });

      // system 只由 systemPrompt 建一个节点，重放里的 system 消息不重复建
      const systems = state.nodes.filter((n) => n.category === "system");
      expect(systems).toHaveLength(1);
      expect(state.sums.user).toBeGreaterThan(0);
      expect(state.sums.assistant).toBeGreaterThan(0);
      expect(state.sums.tool).toBeGreaterThan(0);
      expect(state.humanInputs).toBe(2);
      expect(ops.filter((o) => o.kind === "insertNode")).toHaveLength(5);
    });
  });

  describe("多 run 重放：同一条消息不被算很多遍", () => {
    test("续接会话的 context 归档上一轮全部节点（按分类在库里完成）", () => {
      // 新 run 的 fold 是空的：上一轮节点不在内存里，只能按分类交给 store 归档
      const { state, ops } = run(createFoldState({ isReplay: true, seq: 20 }), {
        type: "context",
        messages: [msg({ role: "user", content: "第一问" })],
        systemPrompt: "系统提示",
      });

      const archive = ops.find((o) => o.kind === "archiveSuperseded");
      expect(archive).toBeDefined();
      if (archive?.kind !== "archiveSuperseded") throw new Error("缺少 archiveSuperseded");
      // 整段上下文被重放取代，消息面六个分类 + 两个信封分类一起归档；
      // tools 必须在内：工具定义每个 run 都整批重注入，不归档就会在浏览器里堆出重复定义
      expect(archive.categories).toEqual([
        "system",
        "tools",
        "user",
        "inject",
        "skill",
        "assistant",
        "tool",
      ]);
      // 归档 epoch = 本 run 首个节点 seq：更早的请求仍能重建出旧节点
      expect(archive.goneAtSeq).toBe(state.nodes[0]!.seq);
      // 归档是本 run 的第一个写操作，必须先于本轮节点插入生效
      expect(ops[0]!.kind).toBe("archiveSuperseded");
      // 标记只消费一次，同 run 内不会重复归档
      expect(state.isReplay).toBe(false);
    });

    test("新会话首个 context 不产生归档（没有上一轮）", () => {
      const { ops } = run(createFoldState(), {
        type: "context",
        messages: [msg({ role: "user", content: "你好" })],
        systemPrompt: "s",
      });
      expect(ops.some((o) => o.kind === "archiveSuperseded")).toBe(false);
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

    test("provider 声明的上下文窗口写进请求快照与会话补丁", () => {
      const { ops } = run(createFoldState(), {
        type: "before_provider_request",
        model: "m",
        contextWindow: 200_000,
      });

      const req = ops.find((o) => o.kind === "insertRequest") as { request: RequestInsert };
      expect(req.request.contextWindow).toBe(200_000);
      const patch = ops.find((o) => o.kind === "upsertSession");
      expect(patch && patch.kind === "upsertSession" ? patch.patch.contextWindow : null).toBe(
        200_000,
      );
    });

    test("未知的 provider/model 不写入会话补丁（不覆盖已知值）", () => {
      const { ops } = run(createFoldState(), {
        type: "before_provider_request",
        model: "m",
      });
      const patch = ops.find((o) => o.kind === "upsertSession");
      if (patch?.kind !== "upsertSession") throw new Error("缺少 upsertSession");
      // model 已知则写，provider 未知（null）则省略，避免抹掉上一轮已知的 provider
      expect(patch.patch.model).toBe("m");
      expect(Object.keys(patch.patch)).not.toContain("provider");
      expect(Object.keys(patch.patch)).not.toContain("contextWindow");
    });

    test("窗口未知时不把已探测到的窗口抹成 0/undefined", () => {
      const r1 = run(createFoldState(), {
        type: "before_provider_request",
        model: "m",
        contextWindow: 128_000,
      });
      const r2 = run(r1.state, { type: "before_provider_request", model: "m" });
      const req = r2.ops.find((o) => o.kind === "insertRequest") as { request: RequestInsert };
      expect(req.request.contextWindow).toBe(128_000);
    });

    test("会话补丁不再写 usage 与 durationMs（归属请求增量与会话收尾）", () => {
      const { ops } = run(createFoldState(), {
        type: "before_provider_request",
        model: "m",
        contextWindow: 1_000,
      });
      const patch = ops.find((o) => o.kind === "upsertSession");
      if (patch?.kind !== "upsertSession") throw new Error("缺少 upsertSession");
      for (const key of ["usageUncached", "usageCacheRead", "usageCacheWrite", "usageOutput", "durationMs"]) {
        expect(Object.keys(patch.patch)).not.toContain(key);
      }
    });
  });

  describe("message_end：消息进入活跃面", () => {
    test("assistant 消息计入 answers，并把真实用量回填到对应请求", () => {
      const s0 = createFoldState();
      // 先拍一次请求快照（锚点），再让 assistant 响应带回 usage
      const r1 = run(s0, { type: "before_provider_request", model: "m" }, 1_000);
      const { state, ops } = run(
        r1.state,
        {
          type: "message_end",
          message: msg({
            role: "assistant",
            content: "这是回答",
            usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
          }),
        },
        4_500,
      );

      expect(state.answers).toBe(1);
      const patch = ops.find((o) => o.kind === "patchRequest");
      expect(patch).toBeDefined();
      if (patch?.kind !== "patchRequest") throw new Error("缺少 patchRequest");
      // 回填到刚拍的那条请求，而不是新建请求
      expect(patch.id).toBe("r-1");
      expect(patch.actual).toEqual({ uncached: 100, output: 20, cacheRead: 0, cacheWrite: 0 });
      // 耗时 = 响应到达 - 请求拍快照
      expect(patch.durationMs).toBe(3_500);
      expect(patch.brief.user).toBe("");
      expect(patch.brief.response).toContain("这是回答");
    });

    test("没有请求锚点时（乱序事件）不产生 patchRequest", () => {
      const { state, ops } = run(createFoldState(), {
        type: "message_end",
        message: msg({
          role: "assistant",
          content: "孤立回答",
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        }),
      });
      expect(ops.some((o) => o.kind === "patchRequest")).toBe(false);
      expect(state.answers).toBe(1);
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

    test("有 schema 时按 schema 估算工具占用（只数名字会严重低估）", () => {
      const schema = [
        {
          name: "web_search",
          description: "在互联网上检索资料并返回摘要",
          parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
        },
      ];
      const withSchema = run(createFoldState(), {
        type: "tools_added",
        toolNames: ["web_search"],
        previousToolNames: [],
        tools: schema,
      });
      const withoutSchema = run(createFoldState(), {
        type: "tools_added",
        toolNames: ["web_search"],
        previousToolNames: [],
      });

      expect(withSchema.state.toolsTokens).toBeGreaterThan(withoutSchema.state.toolsTokens);
      // 事件净变化给出这一批 schema 的估算值
      const event = withSchema.ops.find((o) => o.kind === "insertEvent") as {
        event: ContextEventInsert;
      };
      expect(event.event.deltaTokens).toBe(withSchema.state.toolsTokens);

      // 会话补丁把工具 schema 计入 currentTools
      const patch = withSchema.ops.find((o) => o.kind === "upsertSession");
      expect(patch && patch.kind === "upsertSession" ? patch.patch.currentTools : 0).toBe(
        withSchema.state.toolsTokens,
      );
    });

    test("工具 schema 进 currentTools 时同步 currentTotal（否则各桶之和对不上总量）", () => {
      const withContext = run(createFoldState(), {
        type: "context",
        messages: [msg({ role: "user", content: "你好" })],
        systemPrompt: "系统提示",
      });
      const { ops } = run(withContext.state, {
        type: "tools_added",
        toolNames: ["web_search"],
        previousToolNames: [],
        tools: [{ name: "web_search", description: "检索互联网资料", parameters: { type: "object" } }],
      });

      const patch = ops.find((o) => o.kind === "upsertSession");
      if (patch?.kind !== "upsertSession") throw new Error("缺少 upsertSession");
      const p = patch.patch;
      expect(p.currentTools).toBeGreaterThan(0);
      const sum =
        (p.currentSystem ?? 0) +
        (p.currentTools ?? 0) +
        (p.currentUser ?? 0) +
        (p.currentInject ?? 0) +
        (p.currentSkill ?? 0) +
        (p.currentAssistant ?? 0) +
        (p.currentTool ?? 0);
      expect(p.currentTotal).toBe(sum);
    });

    test("空工具列表不产生事件", () => {
      const { ops } = run(createFoldState(), {
        type: "tools_added",
        toolNames: [],
        previousToolNames: ["x"],
      });
      expect(ops.filter((o) => o.kind === "insertEvent").length).toBe(0);
    });

    test("每个工具落一个 tools 节点：浏览器要能逐个展开工具定义，而不是只看到一个总数", () => {
      const { state, ops } = run(createFoldState(), {
        type: "tools_added",
        toolNames: ["web_search", "read"],
        previousToolNames: [],
        tools: [
          { name: "web_search", description: "检索互联网资料", parameters: { type: "object" } },
          { name: "read", description: "读取文件内容", parameters: { type: "object" } },
        ],
      });

      const nodes = ops.filter((o) => o.kind === "insertNode") as Array<{
        kind: "insertNode";
        node: { id: string; seq: number; category: string; name: string; tokens: number; content: string | null };
      }>;
      expect(nodes).toHaveLength(2);
      expect(nodes.map((n) => n.node.category)).toEqual(["tools", "tools"]);
      expect(nodes.map((n) => n.node.name)).toEqual(["web_search", "read"]);
      // seq 必须互不相同：节点按 seq 排序，同 seq 的库内顺序没有保证
      expect(new Set(nodes.map((n) => n.node.seq)).size).toBe(2);
      expect(new Set(nodes.map((n) => n.node.id)).size).toBe(2);
      // content 存整段 schema，展开即可核对定义
      expect(nodes[0]!.node.content).toContain("web_search");
      expect(nodes.every((n) => n.node.tokens > 0)).toBe(true);

      // 合计口径不变：注入事件的净变化 = 各工具节点之和 = currentTools
      const event = ops.find((o) => o.kind === "insertEvent") as {
        event: { deltaTokens: number };
      };
      const nodeSum = nodes.reduce((acc, n) => acc + n.node.tokens, 0);
      expect(event.event.deltaTokens).toBe(nodeSum);
      expect(state.toolsTokens).toBe(nodeSum);
    });

    test("没带 schema 时退化为按工具名估算，仍然建节点", () => {
      const { ops } = run(createFoldState(), {
        type: "tools_added",
        toolNames: ["web_search"],
        previousToolNames: [],
      });
      const node = ops.find((o) => o.kind === "insertNode") as {
        node: { name: string; category: string; content: string | null };
      };
      expect(node.node.name).toBe("web_search");
      expect(node.node.category).toBe("tools");
      expect(node.node.content).toBe("web_search");
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
/**
 * 采集记录器回归测试 — 跨 run 的 seq 续接
 *
 * 背景 bug：fold 的确定性 ID（n-${seq}/r-${seq}/e-${seq}）依赖 seq 在 session 内
 * 全局唯一（getDetail 按 seq 重建时间线，只按 tenant+session 过滤）。但每个 run 的
 * fold 都从 seq=0 开始，同一 session 的第二个 run 会与第一轮残留行主键冲突，
 * 导致 applyOps 整个事务回滚、上下文一条都落不了库。
 * 修复：recorder 在 agent_start 时用 store.currentSeq 续接 fold 的初始 seq。
 */
import { describe, expect, test } from "bun:test";
import type { AgentEvent, AgentEventMessage } from "@ventostack/ai";
import { createContextRecorder } from "../services/recorder";
import type { ContextRecorder } from "../services/recorder";
import type { ContextStore } from "../services/context-store";
import type { UpsertSessionInput } from "../services/context-store";
import type { WriteOp } from "../services/fold-types";

function userMsg(content: string): AgentEventMessage {
  return { role: "user", content, timestamp: Date.now() };
}

function ctx(tenantId: string, sessionId: string, runId: string, content: string): AgentEvent {
  return {
    type: "context",
    run: { runId, sessionId, tenantId, agentId: "a1" },
    messages: [userMsg(content)],
    systemPrompt: "系统提示",
  };
}

interface Deps {
  recorder: ContextRecorder;
  applied: Array<{ tenantId: string; sessionId: string; ops: WriteOp[] }>;
  currentSeqCalls: Array<{ tenantId: string; sessionId: string }>;
  emit: (e: AgentEvent) => Promise<void>;
}

function makeDeps(existingSeq: number): Deps {
  const applied: Array<{ tenantId: string; sessionId: string; ops: WriteOp[] }> = [];
  const currentSeqCalls: Array<{ tenantId: string; sessionId: string }> = [];
  let handler: ((e: AgentEvent) => Promise<void> | void) | null = null;

  const emitter = {
    on(h: (e: AgentEvent) => Promise<void> | void): () => void {
      handler = h;
      return () => {
        handler = null;
      };
    },
  };

  const store: ContextStore = {
    async upsertSession(_input: UpsertSessionInput): Promise<void> {},
    async applyOps(tenantId: string, sessionId: string, ops: WriteOp[]): Promise<void> {
      applied.push({ tenantId, sessionId, ops });
    },
    async closeSession(_tenantId: string, _sessionId: string, _status: string): Promise<void> {},
    async markStaleSessions(_olderThanMs: number): Promise<number> {
      return 0;
    },
    async currentSeq(tenantId: string, sessionId: string): Promise<number> {
      currentSeqCalls.push({ tenantId, sessionId });
      return existingSeq;
    },
  };

  const toggle = { isEnabledForAgent: async (_t: string, _a: string) => true };
  const recorder = createContextRecorder({ emitter, store, toggle });
  recorder.start();

  return {
    recorder,
    applied,
    currentSeqCalls,
    emit: async (e) => {
      if (!handler) throw new Error("recorder 未订阅 emitter");
      await handler(e);
    },
  };
}

describe("采集记录器：跨 run seq 续接", () => {
  test("agent_start 调用 currentSeq 并用它续接 fold 初始 seq", async () => {
    const deps = makeDeps(5);

    await deps.emit({
      type: "agent_start",
      run: { runId: "run-b", sessionId: "sess-1", tenantId: "t", agentId: "a1", userId: "u" },
      meta: { model: "m" },
    });
    // 触发一个产生节点的 context 事件
    await deps.emit(ctx("t", "sess-1", "run-b", "你好"));

    // currentSeq 被调用，且带正确的租户与会话
    expect(deps.currentSeqCalls).toEqual([{ tenantId: "t", sessionId: "sess-1" }]);

    // 首个新节点的 seq 必须 > 已有 max(5)，而不是从 0/1 重新开始
    const nodeOps = deps.applied
      .flatMap((a) => a.ops)
      .filter((o) => o.kind === "insertNode");
    expect(nodeOps.length).toBeGreaterThan(0);
    for (const op of nodeOps) {
      if (op.kind === "insertNode") expect(op.node.seq).toBeGreaterThan(5);
    }
    deps.recorder.stop();
  });

  test("同一 session 第二个 run 的节点 seq 全部大于历史 max，主键不冲突", async () => {
    const deps = makeDeps(11);

    // run-b：与历史 run（seq 已到 11）同 session
    await deps.emit({
      type: "agent_start",
      run: { runId: "run-b", sessionId: "sess-1", tenantId: "t", agentId: "a1" },
    });
    await deps.emit(ctx("t", "sess-1", "run-b", "第一条"));
    await deps.emit(ctx("t", "sess-1", "run-b", "第二条"));

    const seqs = deps.applied
      .flatMap((a) => a.ops)
      .filter((o) => o.kind === "insertNode")
      .map((o) => (o.kind === "insertNode" ? o.node.seq : 0));
    expect(seqs.length).toBeGreaterThan(0);
    // 全部严格大于历史 max(11)，确保与 ai_context_node 主键不冲突
    for (const s of seqs) expect(s).toBeGreaterThan(11);
    deps.recorder.stop();
  });

  test("未开启采集的 agent 不调 currentSeq、不落库", async () => {
    const applied: Array<{ tenantId: string; sessionId: string; ops: WriteOp[] }> = [];
    const currentSeqCalls: string[] = [];
    const emitter = { on: (h: (e: AgentEvent) => void) => void h };
    const store: ContextStore = {
      async upsertSession(): Promise<void> {},
      async applyOps(t: string, s: string, ops: WriteOp[]): Promise<void> {
        applied.push({ tenantId: t, sessionId: s, ops });
      },
      async closeSession(): Promise<void> {},
      async markStaleSessions(): Promise<number> {
        return 0;
      },
      async currentSeq(_t: string, _s: string): Promise<number> {
        currentSeqCalls.push("called");
        return 0;
      },
    };
    // 该 agent 未开启采集
    const toggle = { isEnabledForAgent: async () => false };
    const recorder = createContextRecorder({ emitter: emitter as never, store, toggle });
    recorder.start();
    await recorder.handleEvent({
      type: "agent_start",
      run: { runId: "r", sessionId: "s", tenantId: "t", agentId: "off-agent" },
    });
    await recorder.handleEvent(ctx("t", "s", "r", "hi"));

    expect(currentSeqCalls).toHaveLength(0);
    expect(applied).toHaveLength(0);
    recorder.stop();
  });
});

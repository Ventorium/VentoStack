/**
 * @ventostack/ai-context — 采集记录器
 *
 * 订阅 @ventostack/ai 的事件发射器，按 event.run 路由并发会话，
 * 把事件喂给折叠器，再把折叠产出的 WriteOp 落库。
 *
 * 记录失败不阻断对话主流程（catch + 日志）。
 */

import type { AgentEvent } from "@ventostack/ai";
import { createTagLogger } from "@ventostack/core";
import { applyEvent, createFoldState } from "./fold";
import type { FoldState, WriteOp } from "./fold-types";
import type { ContextStore } from "./context-store";

const logger = createTagLogger("ai-context");

export interface ContextRecorderDeps {
  emitter: {
    on(handler: (event: AgentEvent) => Promise<void> | void): () => void;
  };
  store: ContextStore;
  /** 采集开关按 Agent 判定：只有显式开启的 Agent 才落库 */
  toggle: { isEnabledForAgent(tenantId: string, agentId: string): Promise<boolean> };
}

export interface ContextRecorder {
  handleEvent(event: AgentEvent): Promise<void>;
  start(): void;
  stop(): void;
  activeSessions(): number;
}

/** 会话运行态（一个 run 一个 fold 状态） */
interface RunState {
  fold: FoldState;
  tenantId: string;
  sessionId: string;
  startedAt: number;
}

export function createContextRecorder(deps: ContextRecorderDeps): ContextRecorder {
  const { emitter, store, toggle } = deps;
  const runs = new Map<string, RunState>();
  async function handleEvent(event: AgentEvent): Promise<void> {
    try {
      if (event.type === "agent_start") {
        await onAgentStart(event);
        return;
      }
      const run = event.run;
      if (!run?.runId) return;
      const state = runs.get(run.runId);
      if (!state) return; // 未采集的 run（开关关闭或非 runStream）

      const { state: next, ops } = applyEvent(state.fold, event);
      state.fold = next;
      if (ops.length > 0) {
        await store.applyOps(state.tenantId, state.sessionId, ops);
      }
      await handleTerminal(event, state);
    } catch (err) {
      logger.error(
        `采集上下文事件失败(${event.type}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async function onAgentStart(event: Extract<AgentEvent, { type: "agent_start" }>): Promise<void> {
    const run = event.run;
    if (!run?.runId || !run.sessionId || !run.tenantId) return;

    // 采集开关跟着 Agent 走；未开启或 agentId 缺失都不落库
    const enabled = run.agentId
      ? await toggle.isEnabledForAgent(run.tenantId, run.agentId)
      : false;
    if (!enabled) return;

    // seq 必须在 session 内全局唯一：getDetail 按 seq 重建时间线，且只按
    // tenant+session 过滤（不含 runId）。多轮对话 = 同一 session 多个 run，
    // 每个 run 的 fold 必须从库中已有 max(seq) 续起；否则确定性 ID
    // （n-${seq}/r-${seq}/e-${seq}）与历史行主键冲突，整个 applyOps 事务回滚。
    const seq = await store.currentSeq(run.tenantId, run.sessionId);

    runs.set(run.runId, {
      fold: createFoldState({
        // 接续历史 seq，保证跨 run 单调递增
        seq,
        model: event.meta?.model ?? null,
        skills: new Set(event.meta?.skillIds ?? []),
      }),
      tenantId: run.tenantId,
      sessionId: run.sessionId,
      startedAt: Date.now(),
    });

    await store.upsertSession({
      tenantId: run.tenantId,
      sessionId: run.sessionId,
      agentId: run.agentId ?? null,
      userId: run.userId ?? null,
      parentRunId: run.parentRunId ?? null,
    });
  }

  async function handleTerminal(event: AgentEvent, state: RunState): Promise<void> {
    const run = event.run;
    if (!run?.runId) return;
    if (event.type !== "agent_end" && event.type !== "error" && event.type !== "abort") return;

    runs.delete(run.runId);
    const status = event.type === "agent_end" ? "success" : event.type === "error" ? "error" : "aborted";
    await store.closeSession(state.tenantId, state.sessionId, status);
  }

  let unsubscribe: (() => void) | null = null;

  return {
    handleEvent,
    start(): void {
      if (unsubscribe) return;
      unsubscribe = emitter.on((event) => handleEvent(event));
    },
    stop(): void {
      unsubscribe?.();
      unsubscribe = null;
    },
    activeSessions(): number {
      return runs.size;
    },
  };
}

export type { WriteOp };
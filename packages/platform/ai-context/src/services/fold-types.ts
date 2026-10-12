/**
 * @ventostack/ai-context — 折叠器类型
 *
 * 折叠器（fold）把 Agent 事件流折叠成「每一次模型请求装配出的上下文」。
 * 纯内存状态 + 写操作出箱（outbox），不直接碰数据库，
 * 因此可以脱离 DB 单测（对齐 dsh-context 的 all-or-nothing 纪律）。
 */

import type {
  ContextCategory,
  ContextEventKind,
} from "../shared/types";

/** 消息面分桶（system/tools 是信封标量，不进活跃面） */
export type MessageCategory = "user" | "inject" | "skill" | "assistant" | "tool";

export const MESSAGE_CATEGORIES: readonly MessageCategory[] = [
  "user",
  "inject",
  "skill",
  "assistant",
  "tool",
];

/** 上下文活跃面上的一个元素 */
export interface FoldNode {
  id: string;
  seq: number;
  category: ContextCategory;
  name: string;
  tokens: number;
  preview: string;
  content: string | null;
  images: number;
  /** 被哪个事件 seq 移走；null = 仍存活 */
  goneAtSeq: number | null;
}

/** 会话折叠状态（单 run 内累积，跨 run 由 store 合并） */
export interface FoldState {
  seq: number;
  turnIndex: number;
  /** 活跃面（最旧在前） */
  nodes: FoldNode[];
  /** 消息面各分桶累计 token */
  sums: Record<MessageCategory, number>;
  systemTokens: number;
  toolsTokens: number;
  model: string | null;
  provider: string | null;
  contextWindow: number | null;
  humanInputs: number;
  answers: number;
  /** 已加载技能名（用于 session 级去重计数） */
  skills: Set<string>;
  lastUser: string | null;
  title: string | null;
  /** 已发出的请求数 */
  requestCount: number;
  /** 已注入 / 压缩 / 裁剪 / 切换 的事件数 */
  injectCount: number;
  compactCount: number;
  pruneCount: number;
  /**
   * 最近一次 provider 请求的快照锚点：assistant 响应带 usage 回来时，
   * 用它把「真实用量 / 耗时 / 本轮新增内容」回填到对应请求行。
   * 归属会话的 usage 与 duration 由 store 侧按请求增量维护，fold 不做累加。
   */
  pendingRequestId: string | null;
  pendingRequestAt: number;
  pendingNodeFloor: number;
  /** 本 run 是否为「续接已采集过的会话」（决定 context 是否要归档上一轮重放节点） */
  isReplay: boolean;
}

/** 待落库的写操作 */
export type WriteOp =
  | {
      kind: "upsertSession";
      /** 会话级聚合计数与构成 */
      patch: SessionPatch;
    }
  | { kind: "insertNode"; node: FoldNode }
  | { kind: "archiveNodes"; ids: string[]; goneAtSeq: number }
  /**
   * 按分类归档会话内当前存活的节点（不需要逐个 id）。
   * 用于多 run 重放：新 run 会重新声明系统提示与历史用户消息，
   * 上一轮为同一批内容建的节点必须退出活跃面，否则同一条消息会被算很多遍。
   */
  | { kind: "archiveSuperseded"; categories: ContextCategory[]; goneAtSeq: number }
  | { kind: "insertRequest"; request: RequestInsert }
  | { kind: "patchRequest"; id: string; actual: ActualUsagePatch; durationMs: number; brief: RequestBriefPatch }
  | { kind: "insertEvent"; event: ContextEventInsert }
  | { kind: "insertFileOp"; op: FileOpInsert };

/** 会话聚合计数/构成的增量补丁 */
export interface SessionPatch {
  runCount?: number;
  turnCount?: number;
  stepCount?: number;
  injectCount?: number;
  compactCount?: number;
  pruneCount?: number;
  skillCount?: number;
  humanInputCount?: number;
  answerCount?: number;
  currentSystem?: number;
  currentTools?: number;
  currentUser?: number;
  currentInject?: number;
  currentSkill?: number;
  currentAssistant?: number;
  currentTool?: number;
  currentTotal?: number;
  model?: string | null;
  provider?: string | null;
  contextWindow?: number | null;
  lastUser?: string | null;
  title?: string | null;
}

export interface RequestInsert {
  id: string;
  seq: number;
  turnIndex: number;
  model: string | null;
  provider: string | null;
  messageCount: number;
  contextWindow: number | null;
  system: number;
  tools: number;
  user: number;
  inject: number;
  skill: number;
  assistant: number;
  tool: number;
  total: number;
}

export interface ActualUsagePatch {
  uncached: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface RequestBriefPatch {
  user: string;
  incoming: string[];
  response: string;
}

export interface ContextEventInsert {
  id: string;
  seq: number;
  kind: ContextEventKind;
  producer: string;
  deltaTokens: number;
  turnIndex: number;
  detail: Record<string, unknown> | null;
}

export interface FileOpInsert {
  id: string;
  seq: number;
  path: string;
  kind: "read" | "write" | "search";
  tool: string;
  err: boolean;
  added: number;
  removed: number;
  detail: string | null;
}
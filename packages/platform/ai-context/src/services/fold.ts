/**
 * @ventostack/ai-context — 会话折叠器
 *
 * 把 Agent 事件流折叠成「当前活跃上下文 + 每次请求的装配快照」。
 * 纯函数式维护 FoldState，把持久化交给 recorder 通过 WriteOp 出箱执行。
 *
 * 移植自 dsh-context host/fold.ts，保留三条核心纪律：
 *  1. 惰性克隆：绝不原地修改已交给持久化的对象（archive 存拷贝并盖 goneAtSeq）。
 *  2. 快照时点：RequestRecord 在 assistant 响应进入活跃面「之前」拍，
 *     这样「本次请求带了什么」与后续消息无关。
 *  3. 压缩/裁剪：移除的节点不是删除，而是打 goneAtSeq 进归档，
 *     使浏览器可重建任意请求的装配结果。
 */

import type { AgentEvent, AgentEventMessage } from "@ventostack/ai";
import { estimateStringTokens, estimateSystemTokens } from "../shared/estimate";
import { isMessageCategory, messageCategoryOf, previewOf, skillNameOf } from "./classify";
import type {
  ContextEventInsert,
  FileOpInsert,
  FoldNode,
  FoldState,
  RequestBriefPatch,
  RequestInsert,
  SessionPatch,
  WriteOp,
} from "./fold-types";
import { MESSAGE_CATEGORIES } from "./fold-types";

/** 文件操作相关工具（用于 File Activity 折叠） */
const FILE_TOOLS = new Set(["read", "write", "edit", "multi_edit", "grep", "glob", "search"]);

/** 上下文变更事件的产生者标签 */
const PRODUCER_MODEL = "model";
const PRODUCER_TOOLS = "tools";

export interface FoldResult {
  /** 折叠后的状态（下一个事件接着 fold） */
  state: FoldState;
  /** 本次事件产生的写操作（由 recorder 落库） */
  ops: WriteOp[];
}

export function createFoldState(partial?: Partial<FoldState>): FoldState {
  return {
    seq: 0,
    turnIndex: 0,
    nodes: [],
    sums: { user: 0, inject: 0, skill: 0, assistant: 0, tool: 0 },
    systemTokens: 0,
    toolsTokens: 0,
    model: null,
    provider: null,
    contextWindow: null,
    usage: { uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0 },
    humanInputs: 0,
    answers: 0,
    skills: new Set<string>(),
    durationMs: 0,
    lastUser: null,
    title: null,
    requestCount: 0,
    injectCount: 0,
    compactCount: 0,
    pruneCount: 0,
    ...partial,
  };
}

/**
 * 应用单个事件，产生新状态与写操作。
 *
 * 不可信输入宁可丢事件也不抛（对齐 dsh-context all-or-nothing）：
 * 单个 handler 抛错时返回原状态与空 ops，保证折叠不中断。
 */
export function applyEvent(prev: FoldState, event: AgentEvent): FoldResult {
  try {
    switch (event.type) {
      case "context":
        return onContext(prev, event.messages, event.systemPrompt);
      case "turn_start":
        return onTurnStart(prev);
      case "before_provider_request":
        return onBeforeRequest(prev, event.model);
      case "message_end":
        return onMessageEnd(prev, event.message);
      case "tool_execution_start":
      case "tool_execution_end":
        return { state: prev, ops: [] };
      case "tools_added":
        return onToolsAdded(prev, event.toolNames);
      case "abort":
        return onAbort(prev, event.clearedMessages.length);
      default:
        return { state: prev, ops: [] };
    }
  } catch {
    return { state: prev, ops: [] };
  }
}

/** 惰性克隆会原地修改的集合 */
function clone(state: FoldState): FoldState {
  return {
    ...state,
    nodes: [...state.nodes],
    sums: { ...state.sums },
    usage: { ...state.usage },
    skills: new Set(state.skills),
  };
}

// ---- context：初始系统提示 + 首轮消息面 ----
function onContext(prev: FoldState, messages: AgentEventMessage[], systemPrompt: string): FoldResult {
  const s = clone(prev);
  const ops: WriteOp[] = [];
  s.systemTokens = estimateSystemTokens(systemPrompt);

  // 系统提示作为独立节点（信封类，不进消息面 sums）
  const sysNode: FoldNode = {
    id: `n-${s.seq + 1}-sys`,
    seq: s.seq + 1,
    category: "system",
    name: "系统提示",
    tokens: s.systemTokens,
    preview: previewOf(systemPrompt),
    content: systemPrompt,
    images: 0,
    goneAtSeq: null,
  };
  s.seq += 1;
  s.nodes.push(sysNode);
  ops.push({ kind: "insertNode", node: sysNode });

  // 首轮用户消息进消息面
  for (const m of messages) {
    if (m.role !== "user") continue;
    const node = makeMessageNode(s, m, undefined);
    s.nodes.push(node);
    s.sums.user += node.tokens;
    s.humanInputs += 1;
    s.lastUser = previewOf(m.content);
    s.title ??= previewOf(m.content, 60);
    ops.push({ kind: "insertNode", node });
  }

  ops.push({ kind: "upsertSession", patch: sessionPatchFrom(s, { humanInputCount: s.humanInputs }) });
  return { state: s, ops };
}

// ---- turn_start：轮次 +1 ----
function onTurnStart(prev: FoldState): FoldResult {
  const s = clone(prev);
  s.turnIndex += 1;
  return { state: s, ops: [{ kind: "upsertSession", patch: { turnCount: s.turnIndex } }] };
}

// ---- before_provider_request：在新响应入面「前」拍请求快照 ----
function onBeforeRequest(prev: FoldState, model: string): FoldResult {
  const s = clone(prev);
  s.seq += 1;
  s.model = model;
  s.requestCount += 1;

  const insert: RequestInsert = {
    id: `r-${s.seq}`,
    seq: s.seq,
    turnIndex: s.turnIndex,
    model,
    provider: s.provider,
    messageCount: s.nodes.filter((n) => isMessageCategory(n.category) && n.goneAtSeq === null).length,
    contextWindow: s.contextWindow,
    system: s.systemTokens,
    tools: s.toolsTokens,
    user: s.sums.user,
    inject: s.sums.inject,
    skill: s.sums.skill,
    assistant: s.sums.assistant,
    tool: s.sums.tool,
    total:
      s.systemTokens +
      s.toolsTokens +
      s.sums.user +
      s.sums.inject +
      s.sums.skill +
      s.sums.assistant +
      s.sums.tool,
  };
  return { state: s, ops: [{ kind: "insertRequest", request: insert }] };
}

// ---- message_end：assistant/tool/user 消息进入活跃面 ----
function onMessageEnd(prev: FoldState, message: AgentEventMessage): FoldResult {
  const s = clone(prev);
  const ops: WriteOp[] = [];

  const node = makeMessageNode(s, message, undefined);
  s.nodes.push(node);
  const cat = node.category;
  if (isMessageCategory(cat)) {
    s.sums[cat] += node.tokens;
  }

  if (message.role === "assistant") {
    if (message.usage) {
      s.usage.uncached += message.usage.promptTokens;
      s.usage.output += message.usage.completionTokens;
    }
    if (message.content.trim().length > 0) s.answers += 1;
    if (message.model) s.model = message.model;
    if (message.provider) s.provider = message.provider;
  }

  const patch = sessionPatchFrom(s, { answerCount: s.answers });
  ops.push({ kind: "insertNode", node });
  ops.push({ kind: "upsertSession", patch });
  return { state: s, ops };
}

// ---- tools_added：工具 schema 变更（注入事件） ----
function onToolsAdded(prev: FoldState, toolNames: string[]): FoldResult {
  if (toolNames.length === 0) return { state: prev, ops: [] };
  const s = clone(prev);
  s.seq += 1;
  s.injectCount += 1;
  s.toolsTokens += estimateStringTokens(toolNames.join(","));
  const event: ContextEventInsert = {
    id: `e-${s.seq}`,
    seq: s.seq,
    kind: "inject",
    producer: PRODUCER_TOOLS,
    deltaTokens: 0,
    turnIndex: s.turnIndex,
    detail: { tools: toolNames.slice(0, 50) },
  };
  return {
    state: s,
    ops: [
      { kind: "insertEvent", event },
      { kind: "upsertSession", patch: { injectCount: s.injectCount, currentTools: s.toolsTokens } },
    ],
  };
}

// ---- abort：压缩/裁剪，把存活节点打 goneAtSeq 进归档 ----
function onAbort(prev: FoldState, clearedCount: number): FoldResult {
  if (clearedCount <= 0) return { state: prev, ops: [] };
  const s = clone(prev);
  s.seq += 1;

  // 取最旧的 clearedCount 个存活消息面节点移出活跃面
  const toArchive: FoldNode[] = [];
  for (const n of s.nodes) {
    if (toArchive.length >= clearedCount) break;
    if (n.goneAtSeq === null && isMessageCategory(n.category)) {
      toArchive.push(n);
    }
  }
  const ids: string[] = [];
  let freed = 0;
  for (const n of toArchive) {
    const idx = s.nodes.indexOf(n);
    if (idx >= 0) {
      s.nodes.splice(idx, 1);
      s.sums[n.category as keyof typeof s.sums] -= n.tokens;
      freed += n.tokens;
    }
    ids.push(n.id);
  }

  const kind = "compact";
  s.compactCount += 1;
  const event: ContextEventInsert = {
    id: `e-${s.seq}`,
    seq: s.seq,
    kind,
    producer: PRODUCER_MODEL,
    deltaTokens: -freed, // 负数 = 回收了多少
    turnIndex: s.turnIndex,
    detail: { cleared: clearedCount },
  };
  return {
    state: s,
    ops: [
      { kind: "archiveNodes", ids, goneAtSeq: s.seq },
      { kind: "insertEvent", event },
      {
        kind: "upsertSession",
        patch: {
          compactCount: s.compactCount,
          currentUser: s.sums.user,
          currentInject: s.sums.inject,
          currentSkill: s.sums.skill,
          currentAssistant: s.sums.assistant,
          currentTool: s.sums.tool,
        },
      },
    ],
  };
}

// ---- 内部：从 FoldState 提取会话补丁的公共部分 ----
function sessionPatchFrom(s: FoldState, extra: SessionPatch = {}): SessionPatch {
  return {
    currentSystem: s.systemTokens,
    currentTools: s.toolsTokens,
    currentUser: s.sums.user,
    currentInject: s.sums.inject,
    currentSkill: s.sums.skill,
    currentAssistant: s.sums.assistant,
    currentTool: s.sums.tool,
    currentTotal:
      s.systemTokens +
      s.toolsTokens +
      s.sums.user +
      s.sums.inject +
      s.sums.skill +
      s.sums.assistant +
      s.sums.tool,
    usageUncached: s.usage.uncached,
    usageCacheRead: s.usage.cacheRead,
    usageCacheWrite: s.usage.cacheWrite,
    usageOutput: s.usage.output,
    durationMs: s.durationMs,
    model: s.model,
    provider: s.provider,
    contextWindow: s.contextWindow,
    lastUser: s.lastUser,
    stepCount: s.requestCount,
    ...extra,
  };
}

// ---- 内部：构造一个消息节点 ----
function makeMessageNode(s: FoldState, m: AgentEventMessage, toolName?: string): FoldNode {
  s.seq += 1;
  const category = messageCategoryOf(m, toolName);
  const tokens = estimateStringTokens(m.content);
  let name: string = category;
  if (category === "tool") name = toolName ?? m.toolCallId ?? "tool";
  if (category === "skill") name = skillNameOf(m.content) ?? "skill";
  if (category === "assistant") name = m.model ?? "assistant";
  if (category === "user") name = "user";
  return {
    id: `n-${s.seq}`,
    seq: s.seq,
    category,
    name,
    tokens,
    preview: previewOf(m.content),
    content: m.content,
    images: 0,
    goneAtSeq: null,
  };
}

export { FILE_TOOLS };
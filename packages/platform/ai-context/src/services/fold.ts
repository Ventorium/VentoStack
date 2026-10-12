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
    humanInputs: 0,
    answers: 0,
    skills: new Set<string>(),
    lastUser: null,
    title: null,
    requestCount: 0,
    injectCount: 0,
    compactCount: 0,
    pruneCount: 0,
    pendingRequestId: null,
    pendingRequestAt: 0,
    pendingNodeFloor: 0,
    isReplay: false,
    ...partial,
  };
}

/**
 * 应用单个事件，产生新状态与写操作。
 *
 * 不可信输入宁可丢事件也不抛（对齐 dsh-context all-or-nothing）：
 * 单个 handler 抛错时返回原状态与空 ops，保证折叠不中断。
 */
export function applyEvent(prev: FoldState, event: AgentEvent, now = Date.now()): FoldResult {
  try {
    switch (event.type) {
      case "context":
        return onContext(prev, event.messages, event.systemPrompt);
      case "turn_start":
        return onTurnStart(prev);
      case "before_provider_request":
        return onBeforeRequest(prev, event.model, event.contextWindow ?? null, now);
      case "message_end":
        return onMessageEnd(prev, event.message, now);
      case "tool_execution_start":
      case "tool_execution_end":
        return { state: prev, ops: [] };
      case "tools_added":
        return onToolsAdded(prev, event.toolNames, event.tools);
      case "abort":
        return onAbort(prev, event.clearedMessages.length);
      default:
        return { state: prev, ops: [] };
    }
  } catch {
    return { state: prev, ops: [] };
  }
}

/** 任意值 → 文本长度估算用字符串；序列化失败返回空串（计 0，不抛） */
function toJsonText(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

/** 惰性克隆会原地修改的集合 */
function clone(state: FoldState): FoldState {
  return {
    ...state,
    nodes: [...state.nodes],
    sums: { ...state.sums },
    skills: new Set(state.skills),
  };
}

// ---- context：本 run 装配出的完整上下文（系统提示 + 历史 + 本轮输入） ----
function onContext(prev: FoldState, messages: AgentEventMessage[], systemPrompt: string): FoldResult {
  const s = clone(prev);
  const ops: WriteOp[] = [];
  s.systemTokens = estimateSystemTokens(systemPrompt);

  s.seq += 1;
  // 每个 run 重放整段上下文：上一轮的节点全部被本次重放取代，必须退出活跃面，
  // 否则「重建某一请求时刻的装配结果」会把同一条消息算很多遍，DNA 指纹与元素计数虚高。
  // 归档 epoch 取本 run 首个 seq：更早的请求（seq < epoch）仍能重建出旧节点。
  // 归档按分类在库里完成：新 run 的 fold 是空的，看不到上一轮节点，只能交给 store。
  if (prev.isReplay) {
    ops.push({
      kind: "archiveSuperseded",
      categories: ["system", ...MESSAGE_CATEGORIES],
      goneAtSeq: s.seq,
    });
    s.isReplay = false;
  }

  // 系统提示作为独立节点（信封类，不进消息面 sums）
  const sysNode: FoldNode = {
    id: `n-${s.seq}-sys`,
    seq: s.seq,
    category: "system",
    name: "系统提示",
    tokens: s.systemTokens,
    preview: previewOf(systemPrompt),
    content: systemPrompt,
    images: 0,
    goneAtSeq: null,
  };
  s.nodes.push(sysNode);
  ops.push({ kind: "insertNode", node: sysNode });

  // 重放出的历史与本轮输入一并进消息面：这一刻模型真正读到的东西就是它们，
  // 只记 role=user 会让「上下文总量」远小于实际（模型读到的历史全被漏掉）。
  // system 跳过：它已由 systemPrompt 单独建节点，避免同一条提示算两遍。
  for (const m of messages) {
    if (m.role === "system") continue;
    const node = makeMessageNode(s, m, undefined);
    s.nodes.push(node);
    const cat = node.category;
    if (isMessageCategory(cat)) s.sums[cat] += node.tokens;
    if (m.role === "user") {
      s.humanInputs += 1;
      s.lastUser = previewOf(m.content);
      s.title ??= previewOf(m.content, 60);
    }
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
function onBeforeRequest(
  prev: FoldState,
  model: string,
  contextWindow: number | null,
  now: number,
): FoldResult {
  const s = clone(prev);
  s.seq += 1;
  s.model = model;
  s.requestCount += 1;
  // provider 声明的窗口只在有值时覆盖，避免下游订阅方没带能力时把已知窗口抹掉
  if (contextWindow !== null && contextWindow > 0) s.contextWindow = contextWindow;

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
  // 锚点：assistant 响应回来后据此回填真实用量 / 耗时 / 本轮新增内容
  s.pendingRequestId = insert.id;
  s.pendingRequestAt = now;
  s.pendingNodeFloor = s.nodes.length;
  return {
    state: s,
    ops: [
      { kind: "insertRequest", request: insert },
      // 上下文窗口只有请求时刻才探测得到，随会话行一起落库（当前构成由消息事件维护）
      {
        kind: "upsertSession",
        patch: { contextWindow: s.contextWindow, model: s.model, provider: s.provider },
      },
    ],
  };
}

// ---- message_end：assistant/tool/user 消息进入活跃面 ----
function onMessageEnd(prev: FoldState, message: AgentEventMessage, now: number): FoldResult {
  const s = clone(prev);
  const ops: WriteOp[] = [];

  const node = makeMessageNode(s, message, undefined);
  s.nodes.push(node);
  const cat = node.category;
  if (isMessageCategory(cat)) {
    s.sums[cat] += node.tokens;
  }

  if (message.role === "assistant") {
    if (message.content.trim().length > 0) s.answers += 1;
    if (message.model) s.model = message.model;
    if (message.provider) s.provider = message.provider;
    // 真实用量只认提供方上报：一个 provider 请求对应一条 assistant 消息，
    // 因此这里回填的是「本次请求」的用量与耗时，归属会话的累加交给 store。
    if (message.usage && s.pendingRequestId !== null) {
      ops.push({
        kind: "patchRequest",
        id: s.pendingRequestId,
        actual: {
          uncached: message.usage.promptTokens,
          output: message.usage.completionTokens,
          // 网关未上报缓存读写分桶，诚实记 0（不猜测）
          cacheRead: 0,
          cacheWrite: 0,
        },
        durationMs: Math.max(0, now - s.pendingRequestAt),
        brief: {
          user: s.lastUser ?? "",
          incoming: s.nodes
            .slice(s.pendingNodeFloor)
            .filter((n) => n.category === "tool")
            .slice(0, 5)
            .map((n) => n.preview),
          response: previewOf(message.content),
        },
      });
      s.pendingRequestId = null;
    }
  }

  const patch = sessionPatchFrom(s, { answerCount: s.answers });
  ops.push({ kind: "insertNode", node });
  ops.push({ kind: "upsertSession", patch });
  return { state: s, ops };
}

// ---- tools_added：工具 schema 变更（注入事件） ----
function onToolsAdded(
  prev: FoldState,
  toolNames: string[],
  tools?: ReadonlyArray<unknown>,
): FoldResult {
  if (toolNames.length === 0) return { state: prev, ops: [] };
  const s = clone(prev);
  s.seq += 1;
  s.injectCount += 1;
  // 工具 schema 才是这一桶的大头（描述 + 参数 JSON）：有 schema 就按 schema 估算，
  // 只有名字时退化为按名字估算（会把「工具 schema」算成接近于 0）
  const payload = tools && tools.length > 0 ? toJsonText(tools) : toolNames.join(",");
  const tokens = estimateStringTokens(payload);
  s.toolsTokens += tokens;
  const event: ContextEventInsert = {
    id: `e-${s.seq}`,
    seq: s.seq,
    kind: "inject",
    producer: PRODUCER_TOOLS,
    deltaTokens: tokens,
    turnIndex: s.turnIndex,
    detail: { tools: toolNames.slice(0, 50) },
  };
  return {
    state: s,
    ops: [
      { kind: "insertEvent", event },
      // 用 sessionPatchFrom 统一出补丁：工具 schema 进 currentTools 时必须同步 currentTotal，
      // 否则占比各桶之和对不上总量（前端百分比会超过 100%）
      { kind: "upsertSession", patch: sessionPatchFrom(s, { injectCount: s.injectCount }) },
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
      // 用 sessionPatchFrom 统一出补丁：裁剪后 currentTotal 必须跟着各分桶一起缩，
      // 手写子集会漏掉 currentTotal，导致会话构成总量停在裁剪前的值
      { kind: "upsertSession", patch: sessionPatchFrom(s, { compactCount: s.compactCount }) },
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
/**
 * @ventostack/ai-context — 上下文感知领域类型
 *
 * 设计参考 `dsh-context`（DeepSeek Harness 上下文洞察插件，Apache-2.0），
 * 但数据来源不是宿主日志，而是 VentoStack `@ventostack/ai` 的事件流：
 *
 *   dsh-context（读日志）              →  ai-context（订阅事件）
 *   ─────────────────────────          ──────────────────────────
 *   session log 扫描                  agent_start / agent_end 事件
 *   system/message                    context.systemPrompt
 *   before_provider_request           before_provider_request 事件
 *   user/message · assistant/message  message_end 事件
 *   tool/call · tool/result           tool_execution_start/end 事件
 *   compaction / prune                abort.clearedMessages 事件
 *   parentRunId 血缘                   AgentRunContext.parentRunId
 *
 * 核心概念：
 *   - ContextSession 会话维度的上下文画像（跨 run 聚合）
 *   - SurfaceNode     上下文中存活的一个组成元素（系统提示/工具/消息…）
 *   - RequestRecord   每一次模型请求装配出的上下文快照
 *   - ContextEvent    上下文变更事件（注入/压缩/裁剪/切换）
 *   - FileOpRecord    Agent 对文件做的一次操作
 */

/**
 * 上下文表面的定价分桶。
 *
 * `system` / `tools` 是请求头（每次请求重发的固定成本），
 * 其余是随轮次增长的消息面。`skill` 单列，避免技能内容
 * 藏进 `inject` 或 `tool` 分桶里看不见（对齐 dsh-context issue #66）。
 */
export type ContextCategory =
  | "system"
  | "tools"
  | "user"
  | "inject"
  | "skill"
  | "assistant"
  | "tool";

/** 上下文构成（各分桶的 token 估算 + 合计） */
export interface Composition {
  system: number;
  tools: number;
  user: number;
  inject: number;
  skill: number;
  assistant: number;
  tool: number;
  total: number;
}

/** 提供方上报的真实用量（与估算值并列展示，不混算） */
export interface ActualUsage {
  /** 未命中缓存的输入 token */
  uncachedInputTokens: number;
  /** 输出 token（含 reasoning） */
  outputTokens: number;
  /** 命中缓存读取的 prompt token */
  cacheReadTokens: number;
  /** 写入缓存的 prompt token */
  cacheWriteTokens: number;
}

/** 累计真实用量（四桶互斥） */
export interface ActualUsageTotals {
  uncached: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
}

/** 会话统计计数（对保留期内的记录做预聚合，避免前端遍历全集） */
export interface SessionCounts {
  turns: number;
  steps: number;
  injects: number;
  compactions: number;
  prunes: number;
  /** 本会话加载过的不同技能数 */
  skills: number;
  /** 人工输入次数（用户消息 + ask_user_question 回答） */
  humanInputs: number;
  /** 有文本回复的 assistant 消息数 */
  answers: number;
}

/** 一次上下文变更事件 */
export type ContextEventKind =
  /** 外部上下文注入（技能目录、知识库、引导语、工具新增） */
  | "inject"
  /** 上下文压缩 */
  | "compact"
  /** 上下文裁剪 */
  | "prune"
  /** 模型切换 */
  | "switch";

export interface ContextEventRecord {
  id: string;
  sessionId: string;
  seq: number;
  kind: ContextEventKind;
  /** 产生者标识（instruction file / plugin id / skill name / model 名） */
  producer: string;
  /** 本次事件的净 token 变化（压缩为负数 = 回收了多少） */
  deltaTokens: number;
  turnIndex: number;
  /** 事件明细（被注入/被移除的节点摘要等） */
  detail: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * 上下文中一个存活的组成元素。
 *
 * 压缩/裁剪把节点移出活跃面时不是删除，而是打上 `goneAtSeq`
 * （由哪个事件移走的），从而可以重建「任意一次请求装配了什么」。
 */
export interface SurfaceNode {
  id: string;
  sessionId: string;
  seq: number;
  category: ContextCategory;
  /** 元素名（工具名、模型名、消息摘要） */
  name: string;
  /** 该元素的 token 估算 */
  tokens: number;
  /** 列表态摘要（浏览器折叠时展示） */
  preview: string;
  /** 完整内容（浏览器展开时展示；大内容按截断上限存储） */
  content: string | null;
  /** 图片数量 */
  images: number;
  /** 被移除该节点的事件 seq；undefined = 仍存活 */
  goneAtSeq: number | null;
  createdAt: string;
}

/** 每一次模型请求装配出的上下文快照 */
export interface RequestRecord {
  id: string;
  sessionId: string;
  seq: number;
  turnIndex: number;
  model: string | null;
  provider: string | null;
  /** 本次请求携带的消息条数 */
  messageCount: number;
  /** 上下文窗口上限（模型路由能力） */
  contextWindow: number | null;
  /** 各分桶估算 */
  composition: Composition;
  /** 提供方上报的真实用量（本次请求） */
  actual: ActualUsage | null;
  /** 本次请求耗时（毫秒，从 before_provider_request 到对应 message_end） */
  durationMs: number | null;
  /**
   * 步骤简报（对齐 dsh-context 的 Step brief）：
   * user  = 开启本轮的用户消息摘要
   * in    = 本轮新进入上下文的内容摘要
   * response = 本轮的回复 / 工具调用摘要
   */
  brief: RequestBrief | null;
  createdAt: string;
}

/** 单次请求的步骤简报 */
export interface RequestBrief {
  user: string;
  incoming: string[];
  response: string;
}

/** 一次文件操作（read / write / search） */
export interface FileOpRecord {
  id: string;
  sessionId: string;
  seq: number;
  /** 目标文件路径；无路径的搜索记搜索模式 */
  path: string;
  kind: FileOpKind;
  /** 产生该操作的工具名 */
  tool: string;
  err: boolean;
  /** 估算新增行数 */
  added: number;
  /** 估算删除行数 */
  removed: number;
  /** 搜索命中的关键词 / 补充说明 */
  detail: string | null;
  createdAt: string;
}

export type FileOpKind = "read" | "write" | "search";

/** 会话聚合行 */
export interface ContextSession {
  id: string;
  tenantId: string;
  /** 会话 ID（= AgentRunContext.sessionId） */
  sessionId: string;
  title: string | null;
  agentId: string | null;
  agentName: string | null;
  userId: string | null;
  userName: string | null;
  /** 父 run（子 agent 血缘） */
  parentRunId: string | null;
  runCount: number;
  model: string | null;
  provider: string | null;
  contextWindow: number | null;
  status: ContextSessionStatus;
  counts: SessionCounts;
  /** 当前活跃上下文构成 */
  current: Composition;
  /** 累计真实用量 */
  usage: ActualUsageTotals;
  /** 累计耗时（毫秒） */
  durationMs: number;
  /** 最新一条用户消息摘要 */
  lastUser: string | null;
  startedAt: string;
  endedAt: string | null;
}

export type ContextSessionStatus = "running" | "success" | "error" | "aborted";

/**
 * 单次请求的上下文快照（Context Browser 的数据源）：
 * 活跃面 + 归档面，浏览器据此重建任意 seq 的装配结果。
 */
export interface ContextDetail {
  session: ContextSession;
  requests: RequestRecord[];
  events: ContextEventRecord[];
  nodes: SurfaceNode[];
  /** 因保留上限未下发的活跃节点数（> 0 时重建结果为近似） */
  droppedNodes: number;
  archive: SurfaceNode[];
  /** 归档覆盖下界：seq < archiveFloor 的请求重建可能缺节点 */
  archiveFloor: number | null;
  fileOps: FileOpRecord[];
  /** 增量版本号，客户端用它判断是否需要重取 */
  rev: number;
}

/** 概览页 KPI（跨会话聚合） */
export interface ContextOverview {
  sessionCount: number;
  requestCount: number;
  billedTokens: number;
  estimatedCost: number | null;
  /** 缓存命中率（0~1） */
  cacheHitRate: number | null;
  /** 按天的账目（热力图 / 7 日柱状图） */
  days: ActivityDay[];
  /** 按分桶聚合的构成 */
  composition: Composition;
}

/** 每日活动账目 */
export interface ActivityDay {
  /** 本地日 YYYY-MM-DD */
  day: string;
  tokens: number;
  requests: number;
  cost: number | null;
}

/** 采集开关（读取器） */
export interface ContextToggle {
  isEnabled(): Promise<boolean>;
}

/** 复用框架 AI 事件发射器类型 */
export type ContextEventEmitter = import("@ventostack/ai").AgentEventEmitter;
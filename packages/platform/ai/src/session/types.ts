/**
 * Session 树形结构类型定义
 *
 * 对齐参考实现的 SessionTreeEntry 联合类型，
 * 支持分支导航、标签、模型变更、上下文压缩等。
 */

// ---- Entry 类型 ----

export interface MessageEntry {
  type: "message";
  id: string;
  parentId: string | null;
  timestamp: string;
  message: {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
    toolCallId?: string;
    usage?: { promptTokens: number; completionTokens: number };
    stopReason?: string;
    errorMessage?: string;
    model?: string;
    provider?: string;
    timestamp: number;
  };
}

export interface CompactionEntry {
  type: "compaction";
  id: string;
  parentId: string | null;
  timestamp: string;
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  details?: unknown;
  fromHook?: boolean;
}

export interface BranchSummaryEntry {
  type: "branch_summary";
  id: string;
  parentId: string | null;
  timestamp: string;
  fromId: string;
  summary: string;
  details?: unknown;
}

export interface CustomMessageEntry {
  type: "custom_message";
  id: string;
  parentId: string | null;
  timestamp: string;
  customType: string;
  content: string;
  display: boolean;
  details?: unknown;
}

export interface ModelChangeEntry {
  type: "model_change";
  id: string;
  parentId: string | null;
  timestamp: string;
  provider: string;
  modelId: string;
}

export interface ThinkingLevelChangeEntry {
  type: "thinking_level_change";
  id: string;
  parentId: string | null;
  timestamp: string;
  thinkingLevel: string;
}

export interface ActiveToolsChangeEntry {
  type: "active_tools_change";
  id: string;
  parentId: string | null;
  timestamp: string;
  activeToolNames: string[];
}

export interface LabelEntry {
  type: "label";
  id: string;
  parentId: string | null;
  timestamp: string;
  targetId: string;
  label?: string;
}

export interface SessionInfoEntry {
  type: "session_info";
  id: string;
  parentId: string | null;
  timestamp: string;
  name: string;
}

export interface LeafEntry {
  type: "leaf";
  id: string;
  parentId: string | null;
  timestamp: string;
  targetId: string | null;
}

export interface CustomEntry {
  type: "custom";
  id: string;
  parentId: string | null;
  timestamp: string;
  customType: string;
  data?: unknown;
}

/** 所有 session entry 的联合类型 */
export type SessionTreeEntry =
  | MessageEntry
  | CompactionEntry
  | BranchSummaryEntry
  | CustomMessageEntry
  | ModelChangeEntry
  | ThinkingLevelChangeEntry
  | ActiveToolsChangeEntry
  | LabelEntry
  | SessionInfoEntry
  | LeafEntry
  | CustomEntry;

// ---- Session Context ----

export interface SessionContext {
  messages: Array<MessageEntry["message"]>;
  thinkingLevel: string;
  model: { provider: string; modelId: string } | null;
  activeToolNames: string[] | null;
}

// ---- Session Metadata ----

export interface SessionMetadata {
  id: string;
  createdAt: string;
  path?: string;
  cwd?: string;
}

// ---- Session Storage ----

/** fork 选项（对齐参考实现 ForkOptions） */
export interface SessionForkOptions {
  /** "tree"：复制整棵会话树；"branch"（默认）：复制到指定消息的分支 */
  scope?: "tree" | "branch";
  /** 分支目标消息 ID；省略时取当前 leaf（最新消息） */
  entryId?: string;
  /** "at"：包含目标消息（默认，省略 entryId 时）；"before"：在目标消息之前分叉（默认，指定 entryId 时） */
  position?: "before" | "at";
}

export interface SessionStorage {
  getMetadata(): Promise<SessionMetadata>;
  getLeafId(): Promise<string | null>;
  setLeafId(leafId: string | null): Promise<void>;
  createEntryId(): Promise<string>;
  appendEntry(entry: SessionTreeEntry): Promise<void>;
  getEntry(id: string): Promise<SessionTreeEntry | undefined>;
  getEntries(): Promise<SessionTreeEntry[]>;
  getPathToRoot(leafId: string | null): Promise<SessionTreeEntry[]>;
  findEntries<TType extends SessionTreeEntry["type"]>(
    type: TType,
  ): Promise<Array<Extract<SessionTreeEntry, { type: TType }>>>;
  getLabel(id: string): Promise<string | undefined>;
  /** 用指定 entries 写入新会话文件并返回新 storage（fork 用） */
  fork(
    filePath: string,
    options: { sessionId: string; parentSessionPath?: string; entries: SessionTreeEntry[] },
  ): Promise<SessionStorage>;
}

// ---- Session Interface ----

export interface Session {
  getMetadata(): Promise<SessionMetadata>;
  getLeafId(): Promise<string | null>;
  getEntry(id: string): Promise<SessionTreeEntry | undefined>;
  getEntries(): Promise<SessionTreeEntry[]>;
  getBranch(fromId?: string): Promise<SessionTreeEntry[]>;
  buildContext(): Promise<SessionContext>;
  getLabel(id: string): Promise<string | undefined>;
  getSessionName(): Promise<string | undefined>;
  appendMessage(message: MessageEntry["message"]): Promise<string>;
  appendCompaction(summary: string, firstKeptEntryId: string, tokensBefore: number, details?: unknown): Promise<string>;
  appendLabel(targetId: string, label?: string): Promise<string>;
  appendSessionName(name: string): Promise<string>;
  appendModelChange(provider: string, modelId: string): Promise<string>;
  appendThinkingLevelChange(thinkingLevel: string): Promise<string>;
  appendActiveToolsChange(activeToolNames: string[]): Promise<string>;
  appendCustomEntry(customType: string, data?: unknown): Promise<string>;
  moveTo(entryId: string | null, summary?: { summary: string; details?: unknown }): Promise<string | undefined>;
  /**
   * 从当前会话分叉出一个独立的新会话（对齐参考实现 fork）。
   * 新会话写入 destination.filePath，header 记录 parentSession 指向源会话。
   */
  fork(
    destination: { filePath: string; sessionId: string; parentSessionPath?: string },
    options?: SessionForkOptions,
  ): Promise<Session>;
}

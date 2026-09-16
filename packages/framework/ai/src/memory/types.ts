/**
 * 记忆系统类型定义（Markdown 文件存储模式）
 */
import type { SessionForkOptions } from "../session/types";

export interface ConversationMemory {
  tenantId: string;
  sessionId: string;
  agentId: string;
  userId: string;
  filePath: string;
  title: string;
  status: "active" | "archived";
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface LongTermMemory {
  tenantId: string;
  userId: string;
  filePath: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export type SessionMemoryEventType = "concern" | "hypothesis" | "correction" | "decision" | "constraint" | "preference" | "observation";
export interface SessionMemoryEvent {
  id: string;
  type: SessionMemoryEventType;
  content: string;
  sourceMessageIds: string[];
  createdAt: string;
}
export type MemoryOperation =
  | { op: "ADD"; id: string; content: string; confidence: number; sourceEventIds: string[] }
  | { op: "UPDATE"; id: string; content: string; confidence: number; sourceEventIds: string[] }
  | { op: "SUPERSEDE"; id: string; supersededBy: string; content: string; confidence: number; sourceEventIds: string[] }
  | { op: "DELETE"; id: string; sourceEventIds: string[] };
export interface SessionMemoryState {
  content: string;
  events: SessionMemoryEvent[];
  status: "idle" | "pending" | "processing" | "completed" | "failed";
  error?: string;
  processedEventIds: string[];
}

export interface MemoryService {
  // 对话记忆
  createSession(params: {
    userId: string;
    agentId: string;
    tenantId: string;
  }): Promise<{ sessionId: string }>;
  appendMessage(
    sessionId: string,
    scope: MemoryScope,
    message: { role: string; content: string; model?: string; reasoning?: string },
  ): Promise<void>;
  getSession(sessionId: string, scope: MemoryScope): Promise<ConversationMemory | null>;
  /**
   * 追加自定义条目（会话台账）：不进 LLM 上下文，仅用于前端回显/审计。
   * 会话不存在时静默跳过（与 appendMessage 一致，不阻断调用方主流程）。
   */
  appendCustomEntry(sessionId: string, scope: MemoryScope, customType: string, data?: unknown): Promise<void>;
  /** 更新会话标题（会话总结模型生成标题后调用；缺省标题为 `对话 {sessionId前8位}`） */
  renameSession(sessionId: string, scope: MemoryScope, title: string): Promise<void>;
  listSessions(
    scope: MemoryScope,
    agentId?: string,
  ): Promise<ConversationMemory[]>;
  deleteSession(sessionId: string, scope: MemoryScope): Promise<void>;
  /** 移入回收站（软删除）：会话文件与产物目录移动到 trash/，可恢复 */
  moveSessionToTrash(sessionId: string, scope: MemoryScope): Promise<void>;
  /** 回收站列表（标题 + 删除时间） */
  listTrashedSessions(
    scope: MemoryScope,
  ): Promise<Array<{ sessionId: string; title: string; deletedAt: Date }>>;
  /** 从回收站恢复会话 */
  restoreSession(sessionId: string, scope: MemoryScope): Promise<void>;
  /** 彻底删除单个回收站会话（不可恢复） */
  purgeSession(sessionId: string, scope: MemoryScope): Promise<void>;
  /** 清空回收站（不可恢复） */
  purgeAllTrash(scope: MemoryScope): Promise<void>;
  /**
   * 从现有会话分叉出独立的新会话（开启新的对话分支）。
   * 新会话写入 conversationPath(destination.sessionId)，继承源会话历史。
   */
  forkSession(
    sessionId: string,
    scope: MemoryScope,
    destination: ForkDestination,
  ): Promise<{ sessionId: string }>;
  /** 历史消息：reasoning 仅用于前端回显，调用方构造 LLM 上下文时必须丢弃 */
  getHistory(
    sessionId: string,
    scope: MemoryScope,
    limit?: number,
  ): Promise<Array<{ role: string; content: string; model?: string; reasoning?: string }>>;
  /**
   * 编辑重发场景的会话历史截断：仅保留前 `keepUserMessages` 轮用户消息及其回复，
   * 从第 `keepUserMessages + 1` 条用户消息起丢弃全部后续内容（原文件重写）。
   */
  truncateSessionHistory(
    sessionId: string,
    scope: MemoryScope,
    keepUserMessages: number,
  ): Promise<void>;
  getArtifactRoot(sessionId: string, scope: MemoryScope): Promise<string | null>;
  writeArtifact(sessionId: string, scope: MemoryScope, path: string, content: Uint8Array): Promise<void>;
  listArtifacts(sessionId: string, scope: MemoryScope): Promise<Array<{ path: string; size: number; modifiedAt: string }>>;
  readArtifact(sessionId: string, scope: MemoryScope, path: string): Promise<{ path: string; content: string } | null>;
  /** 读取产物原始字节（预览场景：图片 base64 / file2md 转换）；超过 maxBytes 返回 null */
  readArtifactBytes(
    sessionId: string,
    scope: MemoryScope,
    path: string,
    maxBytes?: number,
  ): Promise<Uint8Array | null>;
  getSessionRuntimeSandbox(sessionId: string, scope: MemoryScope): Promise<string | null>;
  setSessionRuntimeSandbox(sessionId: string, scope: MemoryScope, sandboxId: string): Promise<void>;
  withSessionMemoryLock<T>(sessionId: string, scope: MemoryScope, task: () => Promise<T>): Promise<{ acquired: boolean; result?: T }>;
  listPendingMemoryConsolidations(): Promise<Array<{ sessionId: string; scope: MemoryScope }>>;
  appendMemoryEvent(sessionId: string, scope: MemoryScope, event: Omit<SessionMemoryEvent, "id" | "createdAt">): Promise<SessionMemoryEvent>;
  getSessionMemory(sessionId: string, scope: MemoryScope): Promise<SessionMemoryState | null>;
  setMemoryConsolidationStatus(sessionId: string, scope: MemoryScope, status: SessionMemoryState["status"], error?: string, processedEventIds?: string[]): Promise<void>;
  applyMemoryOperations(sessionId: string, scope: MemoryScope, operations: MemoryOperation[]): Promise<void>;

  // 长期记忆
  createLongTermMemory(
    scope: MemoryScope,
    title: string,
    content: string,
  ): Promise<void>;
  updateLongTermMemory(
    scope: MemoryScope,
    title: string,
    content: string,
  ): Promise<void>;
  readLongTermMemory(
    scope: MemoryScope,
    title: string,
  ): Promise<string | null>;
  listLongTermMemories(scope: MemoryScope): Promise<LongTermMemory[]>;
  deleteLongTermMemory(scope: MemoryScope, title: string): Promise<void>;
}

export interface MemoryScope {
  tenantId: string;
  userId: string;
}

/**
 * 会话内审批台账条目（以 custom entry 落盘，因此天然不进 LLM 上下文）。
 * 审批生命周期跨 SSE 流存活：刷新页面后前端靠这些条目还原待审批弹窗与历史决议。
 */
export interface ApprovalRequestEntry {
  /** 审批单 id（ai_approval_request.id） */
  id: string;
  toolName: string;
  input?: Record<string, unknown>;
  riskLevel?: string;
  /** 待审批有效期（ISO），超时即默认拒绝 */
  expiresAt?: string;
  toolCallId?: string;
  requestedBy?: string;
  createdAt?: string;
}

export interface ApprovalDecisionEntry {
  /** 审批单 id，与 ApprovalRequestEntry.id 对应 */
  id: string;
  status: "approved" | "rejected" | "expired";
  reason?: string;
  decidedBy?: string;
  decidedAt?: string;
}

/** fork 会话目标与选项 */
export interface ForkDestination {
  sessionId: string;
  options?: SessionForkOptions;
}

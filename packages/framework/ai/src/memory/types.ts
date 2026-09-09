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
    message: { role: string; content: string },
  ): Promise<void>;
  getSession(sessionId: string, scope: MemoryScope): Promise<ConversationMemory | null>;
  listSessions(
    scope: MemoryScope,
    agentId?: string,
  ): Promise<ConversationMemory[]>;
  deleteSession(sessionId: string, scope: MemoryScope): Promise<void>;
  /**
   * 从现有会话分叉出独立的新会话（开启新的对话分支）。
   * 新会话写入 conversationPath(destination.sessionId)，继承源会话历史。
   */
  forkSession(
    sessionId: string,
    scope: MemoryScope,
    destination: ForkDestination,
  ): Promise<{ sessionId: string }>;
  getHistory(
    sessionId: string,
    scope: MemoryScope,
    limit?: number,
  ): Promise<Array<{ role: string; content: string }>>;
  getArtifactRoot(sessionId: string, scope: MemoryScope): Promise<string | null>;
  listArtifacts(sessionId: string, scope: MemoryScope): Promise<Array<{ path: string; size: number; modifiedAt: string }>>;
  readArtifact(sessionId: string, scope: MemoryScope, path: string): Promise<{ path: string; content: string } | null>;
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

/** fork 会话目标与选项 */
export interface ForkDestination {
  sessionId: string;
  options?: SessionForkOptions;
}

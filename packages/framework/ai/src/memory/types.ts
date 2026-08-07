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

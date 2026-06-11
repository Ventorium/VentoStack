/**
 * 记忆系统类型定义（Markdown 文件存储模式）
 */

export interface ConversationMemory {
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
    message: { role: string; content: string },
  ): Promise<void>;
  getSession(sessionId: string): Promise<ConversationMemory | null>;
  listSessions(
    userId: string,
    agentId?: string,
  ): Promise<ConversationMemory[]>;
  deleteSession(sessionId: string): Promise<void>;
  getHistory(
    sessionId: string,
    limit?: number,
  ): Promise<Array<{ role: string; content: string }>>;

  // 长期记忆
  createLongTermMemory(
    userId: string,
    title: string,
    content: string,
    tenantId: string,
  ): Promise<void>;
  updateLongTermMemory(
    userId: string,
    title: string,
    content: string,
    tenantId: string,
  ): Promise<void>;
  readLongTermMemory(
    userId: string,
    title: string,
  ): Promise<string | null>;
  listLongTermMemories(userId: string): Promise<LongTermMemory[]>;
  deleteLongTermMemory(userId: string, title: string): Promise<void>;
}

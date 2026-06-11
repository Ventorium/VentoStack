/**
 * Session 实现
 *
 * 树形会话管理，支持分支导航、上下文构建。
 * 使用 SessionStorage 抽象进行持久化。
 */
import type {
  BranchSummaryEntry,
  CompactionEntry,
  MessageEntry,
  Session,
  SessionContext,
  SessionMetadata,
  SessionStorage,
  SessionTreeEntry,
} from "./types";

function buildSessionContext(pathEntries: SessionTreeEntry[]): SessionContext {
  let thinkingLevel = "off";
  let model: { provider: string; modelId: string } | null = null;
  let activeToolNames: string[] | null = null;
  let compaction: CompactionEntry | null = null;

  for (const entry of pathEntries) {
    if (entry.type === "thinking_level_change") {
      thinkingLevel = entry.thinkingLevel;
    } else if (entry.type === "model_change") {
      model = { provider: entry.provider, modelId: entry.modelId };
    } else if (
      entry.type === "message" &&
      entry.message.role === "assistant"
    ) {
      if (entry.message.model && entry.message.provider) {
        model = {
          provider: entry.message.provider,
          modelId: entry.message.model,
        };
      }
    } else if (entry.type === "active_tools_change") {
      activeToolNames = [...entry.activeToolNames];
    } else if (entry.type === "compaction") {
      compaction = entry;
    }
  }

  const messages: Array<MessageEntry["message"]> = [];

  function appendMessage(entry: SessionTreeEntry): void {
    if (entry.type === "message") {
      messages.push(entry.message);
    } else if (entry.type === "custom_message" && entry.display) {
      messages.push({
        role: "user",
        content: entry.content,
        timestamp: new Date(entry.timestamp).getTime(),
      });
    } else if (
      entry.type === "branch_summary" &&
      entry.summary
    ) {
      messages.push({
        role: "user",
        content: `[Branch Summary]\n${entry.summary}`,
        timestamp: new Date(entry.timestamp).getTime(),
      });
    }
  }

  if (compaction) {
    // 插入压缩摘要
    messages.push({
      role: "user",
      content: `[Compacted Summary]\n${compaction.summary}`,
      timestamp: new Date(compaction.timestamp).getTime(),
    });
    // 保留 firstKeptEntryId 之后的消息
    const compactionIdx = pathEntries.findIndex(
      (e) => e.type === "compaction" && e.id === compaction.id,
    );
    let foundFirstKept = false;
    for (let i = 0; i < compactionIdx; i++) {
      const entry = pathEntries[i]!;
      if (entry.id === compaction.firstKeptEntryId)
        foundFirstKept = true;
      if (foundFirstKept) appendMessage(entry);
    }
    for (let i = compactionIdx + 1; i < pathEntries.length; i++) {
      appendMessage(pathEntries[i]!);
    }
  } else {
    for (const entry of pathEntries) {
      appendMessage(entry);
    }
  }

  return { messages, thinkingLevel, model, activeToolNames };
}

export function createSession(storage: SessionStorage): Session {
  async function getMetadata(): Promise<SessionMetadata> {
    return storage.getMetadata();
  }

  async function getLeafId(): Promise<string | null> {
    return storage.getLeafId();
  }

  async function getEntry(
    id: string,
  ): Promise<SessionTreeEntry | undefined> {
    return storage.getEntry(id);
  }

  async function getEntries(): Promise<SessionTreeEntry[]> {
    return storage.getEntries();
  }

  async function getBranch(fromId?: string): Promise<SessionTreeEntry[]> {
    const leafId = fromId ?? (await storage.getLeafId());
    return storage.getPathToRoot(leafId);
  }

  async function buildContext(): Promise<SessionContext> {
    return buildSessionContext(await getBranch());
  }

  async function getLabel(id: string): Promise<string | undefined> {
    return storage.getLabel(id);
  }

  async function getSessionName(): Promise<string | undefined> {
    const entries = await storage.findEntries("session_info");
    return entries[entries.length - 1]?.name?.trim() || undefined;
  }

  async function appendTypedEntry<T extends SessionTreeEntry>(
    entry: T,
  ): Promise<string> {
    await storage.appendEntry(entry);
    return entry.id;
  }

  async function appendMessage(
    message: MessageEntry["message"],
  ): Promise<string> {
    return appendTypedEntry({
      type: "message",
      id: await storage.createEntryId(),
      parentId: await storage.getLeafId(),
      timestamp: new Date().toISOString(),
      message,
    });
  }

  async function appendCompaction(
    summary: string,
    firstKeptEntryId: string,
    tokensBefore: number,
    details?: unknown,
  ): Promise<string> {
    return appendTypedEntry({
      type: "compaction",
      id: await storage.createEntryId(),
      parentId: await storage.getLeafId(),
      timestamp: new Date().toISOString(),
      summary,
      firstKeptEntryId,
      tokensBefore,
      details,
    });
  }

  async function appendLabel(
    targetId: string,
    label?: string,
  ): Promise<string> {
    return appendTypedEntry({
      type: "label",
      id: await storage.createEntryId(),
      parentId: await storage.getLeafId(),
      timestamp: new Date().toISOString(),
      targetId,
      label,
    });
  }

  async function appendSessionName(name: string): Promise<string> {
    return appendTypedEntry({
      type: "session_info",
      id: await storage.createEntryId(),
      parentId: await storage.getLeafId(),
      timestamp: new Date().toISOString(),
      name: name.trim(),
    });
  }

  async function appendModelChange(
    provider: string,
    modelId: string,
  ): Promise<string> {
    return appendTypedEntry({
      type: "model_change",
      id: await storage.createEntryId(),
      parentId: await storage.getLeafId(),
      timestamp: new Date().toISOString(),
      provider,
      modelId,
    });
  }

  async function appendThinkingLevelChange(
    thinkingLevel: string,
  ): Promise<string> {
    return appendTypedEntry({
      type: "thinking_level_change",
      id: await storage.createEntryId(),
      parentId: await storage.getLeafId(),
      timestamp: new Date().toISOString(),
      thinkingLevel,
    });
  }

  async function appendActiveToolsChange(
    activeToolNames: string[],
  ): Promise<string> {
    return appendTypedEntry({
      type: "active_tools_change",
      id: await storage.createEntryId(),
      parentId: await storage.getLeafId(),
      timestamp: new Date().toISOString(),
      activeToolNames: [...activeToolNames],
    });
  }

  async function appendCustomEntry(
    customType: string,
    data?: unknown,
  ): Promise<string> {
    return appendTypedEntry({
      type: "custom",
      id: await storage.createEntryId(),
      parentId: await storage.getLeafId(),
      timestamp: new Date().toISOString(),
      customType,
      data,
    });
  }

  async function moveTo(
    entryId: string | null,
    summary?: { summary: string; details?: unknown },
  ): Promise<string | undefined> {
    if (entryId !== null && !(await storage.getEntry(entryId))) {
      throw new Error(`Entry ${entryId} not found`);
    }
    await storage.setLeafId(entryId);
    if (!summary) return undefined;
    return appendTypedEntry({
      type: "branch_summary",
      id: await storage.createEntryId(),
      parentId: entryId,
      timestamp: new Date().toISOString(),
      fromId: entryId ?? "root",
      summary: summary.summary,
      details: summary.details,
    });
  }

  return {
    getMetadata,
    getLeafId,
    getEntry,
    getEntries,
    getBranch,
    buildContext,
    getLabel,
    getSessionName,
    appendMessage,
    appendCompaction,
    appendLabel,
    appendSessionName,
    appendModelChange,
    appendThinkingLevelChange,
    appendActiveToolsChange,
    appendCustomEntry,
    moveTo,
  };
}

/**
 * Tenant-scoped memory backed by the same JSONL Session module used by AgentHarness.
 * Conversation lookups are O(1) and never scan another tenant or user directory.
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createJsonlSessionStorage, loadJsonlSessionStorage } from "../session/jsonl-storage";
import { createSession } from "../session/session";
import type { ConversationMemory, LongTermMemory, MemoryScope, MemoryService } from "./types";

export interface MemoryServiceDeps {
  storagePath: string;
  db: unknown;
}

interface MemoryMetadata {
  agentId: string;
  userId: string;
  tenantId: string;
  status: "active" | "archived";
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function assertSafeId(value: string, field: string): void {
  if (!SAFE_ID.test(value)) throw new Error(`Invalid ${field}`);
}

function encodeTitle(title: string): string {
  const normalized = title.trim();
  if (!normalized || normalized.length > 128) throw new Error("Invalid memory title");
  return encodeURIComponent(normalized);
}

export function createMemoryService(deps: MemoryServiceDeps): MemoryService {
  const storageRoot = resolve(deps.storagePath);

  function userRoot(scope: MemoryScope): string {
    assertSafeId(scope.tenantId, "tenantId");
    assertSafeId(scope.userId, "userId");
    return join(storageRoot, scope.tenantId, "users", scope.userId);
  }

  function conversationPath(sessionId: string, scope: MemoryScope): string {
    assertSafeId(sessionId, "sessionId");
    return join(userRoot(scope), "conversations", `${sessionId}.jsonl`);
  }

  function longTermPath(scope: MemoryScope, title: string): string {
    return join(userRoot(scope), "long-term", `${encodeTitle(title)}.md`);
  }

  async function readMetadata(
    sessionId: string,
    scope: MemoryScope,
  ): Promise<{ metadata: MemoryMetadata; messageCount: number } | null> {
    const filePath = conversationPath(sessionId, scope);
    if (!existsSync(filePath)) return null;
    const session = createSession(await loadJsonlSessionStorage(filePath));
    const entries = await session.getEntries();
    const metadataEntry = entries.find(
      (entry) => entry.type === "custom" && entry.customType === "memory_metadata",
    );
    const metadata = metadataEntry?.type === "custom"
      ? metadataEntry.data as MemoryMetadata | undefined
      : undefined;
    if (!metadata || metadata.tenantId !== scope.tenantId || metadata.userId !== scope.userId) {
      throw new Error("Memory scope mismatch");
    }
    return {
      metadata,
      messageCount: entries.filter((entry) => entry.type === "message").length,
    };
  }

  async function getSession(sessionId: string, scope: MemoryScope): Promise<ConversationMemory | null> {
    const stored = await readMetadata(sessionId, scope);
    if (!stored) return null;
    const filePath = conversationPath(sessionId, scope);
    const info = await stat(filePath);
    return {
      sessionId,
      tenantId: scope.tenantId,
      agentId: stored.metadata.agentId,
      userId: scope.userId,
      filePath,
      title: `对话 ${sessionId.slice(0, 8)}`,
      status: stored.metadata.status,
      messageCount: stored.messageCount,
      createdAt: info.birthtime,
      updatedAt: info.mtime,
    };
  }

  return {
    async createSession(params): Promise<{ sessionId: string }> {
      const scope = { tenantId: params.tenantId, userId: params.userId };
      userRoot(scope);
      assertSafeId(params.agentId, "agentId");
      const sessionId = crypto.randomUUID();
      const filePath = conversationPath(sessionId, scope);
      await mkdir(join(userRoot(scope), "conversations"), { recursive: true });
      const session = createSession(await createJsonlSessionStorage(filePath, {
        sessionId,
        cwd: userRoot(scope),
      }));
      await session.appendCustomEntry("memory_metadata", {
        agentId: params.agentId,
        userId: params.userId,
        tenantId: params.tenantId,
        status: "active",
      } satisfies MemoryMetadata);
      return { sessionId };
    },

    async appendMessage(sessionId, scope, message): Promise<void> {
      const filePath = conversationPath(sessionId, scope);
      if (!(await readMetadata(sessionId, scope))) return;
      if (message.role !== "system" && message.role !== "user" && message.role !== "assistant" && message.role !== "tool") {
        throw new Error("Invalid memory message role");
      }
      const session = createSession(await loadJsonlSessionStorage(filePath));
      await session.appendMessage({ role: message.role, content: message.content, timestamp: Date.now() });
    },

    getSession,

    async listSessions(scope, agentId): Promise<ConversationMemory[]> {
      const directory = join(userRoot(scope), "conversations");
      if (!existsSync(directory)) return [];
      const sessions: ConversationMemory[] = [];
      for (const file of await readdir(directory)) {
        if (!file.endsWith(".jsonl")) continue;
        const item = await getSession(file.slice(0, -6), scope);
        if (item && (!agentId || item.agentId === agentId)) sessions.push(item);
      }
      return sessions.sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
    },

    async deleteSession(sessionId, scope): Promise<void> {
      const filePath = conversationPath(sessionId, scope);
      if (await readMetadata(sessionId, scope)) await unlink(filePath);
    },

    async forkSession(sessionId, scope, destination): Promise<{ sessionId: string }> {
      const sourcePath = conversationPath(sessionId, scope);
      const stored = await readMetadata(sessionId, scope);
      if (!stored) throw new Error("Session not found");
      assertSafeId(destination.sessionId, "sessionId");
      const forkPath = conversationPath(destination.sessionId, scope);
      const sourceSession = createSession(await loadJsonlSessionStorage(sourcePath));
      await mkdir(join(userRoot(scope), "conversations"), { recursive: true });
      const forkSession = await sourceSession.fork(
        { filePath: forkPath, sessionId: destination.sessionId, parentSessionPath: sourcePath },
        destination.options,
      );
      // 新会话继承源会话的 metadata（agentId / 租户归属），写入独立 memory_metadata
      await forkSession.appendCustomEntry("memory_metadata", {
        agentId: stored.metadata.agentId,
        userId: scope.userId,
        tenantId: scope.tenantId,
        status: "active",
      } satisfies MemoryMetadata);
      return { sessionId: destination.sessionId };
    },

    async getHistory(sessionId, scope, limit): Promise<Array<{ role: string; content: string }>> {
      const filePath = conversationPath(sessionId, scope);
      if (!(await readMetadata(sessionId, scope))) return [];
      const context = await createSession(await loadJsonlSessionStorage(filePath)).buildContext();
      const messages = context.messages.map((message) => ({ role: message.role, content: message.content }));
      return limit && messages.length > limit ? messages.slice(-limit) : messages;
    },

    async createLongTermMemory(scope, title, content): Promise<void> {
      const filePath = longTermPath(scope, title);
      await mkdir(join(userRoot(scope), "long-term"), { recursive: true });
      const now = new Date().toISOString();
      await writeFile(filePath, `---\ntenant_id: ${scope.tenantId}\nuser_id: ${scope.userId}\ncreated_at: ${now}\nupdated_at: ${now}\n---\n\n# ${title.trim()}\n\n${content}\n`, "utf-8");
    },

    async updateLongTermMemory(scope, title, content): Promise<void> {
      await this.createLongTermMemory(scope, title, content);
    },

    async readLongTermMemory(scope, title): Promise<string | null> {
      const filePath = longTermPath(scope, title);
      if (!existsSync(filePath)) return null;
      const content = await readFile(filePath, "utf-8");
      const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
      return bodyMatch?.[1]?.trim() ?? content;
    },

    async listLongTermMemories(scope): Promise<LongTermMemory[]> {
      const directory = join(userRoot(scope), "long-term");
      if (!existsSync(directory)) return [];
      const memories: LongTermMemory[] = [];
      for (const file of await readdir(directory)) {
        if (!file.endsWith(".md")) continue;
        const filePath = join(directory, file);
        const info = await stat(filePath);
        memories.push({
          tenantId: scope.tenantId,
          userId: scope.userId,
          filePath,
          title: decodeURIComponent(file.slice(0, -3)),
          content: (await readFile(filePath, "utf-8")).slice(0, 200),
          createdAt: info.birthtime,
          updatedAt: info.mtime,
        });
      }
      return memories;
    },

    async deleteLongTermMemory(scope, title): Promise<void> {
      const filePath = longTermPath(scope, title);
      if (existsSync(filePath)) await unlink(filePath);
    },
  };
}

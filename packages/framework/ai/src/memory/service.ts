/**
 * Tenant-scoped memory backed by the same JSONL Session module used by AgentHarness.
 * Conversation lookups are O(1) and never scan another tenant or user directory.
 */
import { existsSync } from "node:fs";
import { lstat, mkdir, open, readdir, readFile, realpath, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { createJsonlSessionStorage, loadJsonlSessionStorage } from "../session/jsonl-storage";
import { createSession } from "../session/session";
import type { ApprovalDecisionEntry, ApprovalRequestEntry, ConversationMemory, LongTermMemory, MemoryOperation, MemoryScope, MemoryService, SessionMemoryEvent, SessionMemoryState } from "./types";

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

  function artifactRoot(sessionId: string, scope: MemoryScope): string {
    assertSafeId(sessionId, "sessionId");
    return join(userRoot(scope), "sessions", sessionId, "artifacts");
  }

  function sessionMemoryPath(sessionId: string, scope: MemoryScope): string {
    return join(artifactRoot(sessionId, scope), "..", "MEMORY.md");
  }

  function isWithin(base: string, candidate: string): boolean {
    return candidate === base || candidate.startsWith(base + sep);
  }

  function longTermPath(scope: MemoryScope, title: string): string {
    return join(userRoot(scope), "long-term", `${encodeTitle(title)}.md`);
  }

  async function readMetadata(
    sessionId: string,
    scope: MemoryScope,
  ): Promise<{ metadata: MemoryMetadata; messageCount: number; title: string | null } | null> {
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
    const titleEntry = entries.findLast(
      (entry) => entry.type === "custom" && entry.customType === "session_title",
    );
    const title = titleEntry?.type === "custom"
      ? (titleEntry.data as { title?: unknown } | undefined)?.title
      : undefined;
    return {
      metadata,
      messageCount: entries.filter((entry) => entry.type === "message").length,
      title: typeof title === "string" && title.trim().length > 0 ? title.trim() : null,
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
      title: stored.title ?? `对话 ${sessionId.slice(0, 8)}`,
      status: stored.metadata.status,
      messageCount: stored.messageCount,
      createdAt: info.birthtime,
      updatedAt: info.mtime,
    };
  }

  async function renameSession(sessionId: string, scope: MemoryScope, title: string): Promise<void> {
    const filePath = conversationPath(sessionId, scope);
    if (!existsSync(filePath)) throw new Error("Session not found");
    const normalized = title.trim().slice(0, 60);
    if (!normalized) throw new Error("Invalid session title");
    const session = createSession(await loadJsonlSessionStorage(filePath));
    await session.appendCustomEntry("session_title", { title: normalized });
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
      await session.appendMessage({
        role: message.role,
        content: message.content,
        ...(message.model ? { model: message.model } : {}),
        ...(message.reasoning ? { reasoning: message.reasoning } : {}),
        timestamp: Date.now(),
      });
    },

    getSession,
    renameSession,

    async appendCustomEntry(sessionId, scope, customType, data): Promise<void> {
      const filePath = conversationPath(sessionId, scope);
      if (!(await readMetadata(sessionId, scope))) return;
      const session = createSession(await loadJsonlSessionStorage(filePath));
      await session.appendCustomEntry(customType, data);
    },

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
      if (await readMetadata(sessionId, scope)) {
        await unlink(filePath);
        await rm(join(userRoot(scope), "sessions", sessionId), { recursive: true, force: true });
      }
    },

    async moveSessionToTrash(sessionId, scope): Promise<void> {
      if (!(await readMetadata(sessionId, scope))) throw new Error("Session not found");
      const root = userRoot(scope);
      const trashDir = join(root, "trash");
      await mkdir(trashDir, { recursive: true });
      const sourceFile = conversationPath(sessionId, scope);
      const targetFile = join(trashDir, `${sessionId}.jsonl`);
      if (existsSync(targetFile)) await unlink(targetFile);
      await rename(sourceFile, targetFile);
      const sessionDir = join(root, "sessions", sessionId);
      if (existsSync(sessionDir)) {
        const targetDir = join(trashDir, "sessions", sessionId);
        await rm(targetDir, { recursive: true, force: true });
        await mkdir(dirname(targetDir), { recursive: true });
        await rename(sessionDir, targetDir);
      }
    },

    async listTrashedSessions(scope) {
      const trashDir = join(userRoot(scope), "trash");
      if (!existsSync(trashDir)) return [];
      const items: Array<{ sessionId: string; title: string; deletedAt: Date }> = [];
      for (const file of await readdir(trashDir)) {
        if (!file.endsWith(".jsonl")) continue;
        const sessionId = file.slice(0, -6);
        const info = await stat(join(trashDir, file)).catch(() => null);
        if (!info) continue;
        // 回收站中的标题只读不回写：从文件条目解析，失败回退默认命名
        let title = `对话 ${sessionId.slice(0, 8)}`;
        try {
          const session = createSession(await loadJsonlSessionStorage(join(trashDir, file)));
          const entries = await session.getEntries();
          const titleEntry = entries.findLast(
            (entry) => entry.type === "custom" && entry.customType === "session_title",
          );
          const stored = titleEntry?.type === "custom"
            ? (titleEntry.data as { title?: unknown } | undefined)?.title
            : undefined;
          if (typeof stored === "string" && stored.trim()) title = stored.trim();
        } catch {
          // 解析失败使用默认标题
        }
        items.push({ sessionId, title, deletedAt: info.mtime });
      }
      return items.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
    },

    async restoreSession(sessionId, scope): Promise<void> {
      assertSafeId(sessionId, "sessionId");
      const root = userRoot(scope);
      const trashDir = join(root, "trash");
      const trashedFile = join(trashDir, `${sessionId}.jsonl`);
      if (!existsSync(trashedFile)) throw new Error("Session not in trash");
      await mkdir(join(root, "conversations"), { recursive: true });
      const targetFile = conversationPath(sessionId, scope);
      if (existsSync(targetFile)) throw new Error("Session already exists");
      await rename(trashedFile, targetFile);
      const trashedDir = join(trashDir, "sessions", sessionId);
      if (existsSync(trashedDir)) {
        const targetDir = join(root, "sessions", sessionId);
        await rm(targetDir, { recursive: true, force: true });
        await mkdir(join(root, "sessions"), { recursive: true });
        await rename(trashedDir, targetDir);
      }
    },

    async purgeSession(sessionId, scope): Promise<void> {
      assertSafeId(sessionId, "sessionId");
      const trashDir = join(userRoot(scope), "trash");
      const trashedFile = join(trashDir, `${sessionId}.jsonl`);
      if (!existsSync(trashedFile)) throw new Error("Session not in trash");
      await unlink(trashedFile);
      await rm(join(trashDir, "sessions", sessionId), { recursive: true, force: true });
    },

    async purgeAllTrash(scope): Promise<void> {
      const trashDir = join(userRoot(scope), "trash");
      await rm(trashDir, { recursive: true, force: true });
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

    async getHistory(
      sessionId,
      scope,
      limit,
    ): Promise<Array<{ role: string; content: string; model?: string; reasoning?: string }>> {
      const filePath = conversationPath(sessionId, scope);
      // 回收站中的会话只读可见（前端回收站查看内容场景）
      let source = filePath;
      if (!(await readMetadata(sessionId, scope))) {
        const trashedFile = join(userRoot(scope), "trash", `${sessionId}.jsonl`);
        if (!existsSync(trashedFile)) return [];
        source = trashedFile;
      }
      const session = createSession(await loadJsonlSessionStorage(source));
      // 按会话路径条目重建（而非 buildContext）：需要把审批台账条目按原位置插入消息之间。
      // 聊天路径不产生 compaction 条目（仅 harness 的独立 prompt 路径使用），此处不做压缩摘要回放。
      const entries = await session.getBranch();
      // 审批台账按「文件顺序」读取：决议由事件订阅异步落盘，可能与记忆整理等并发追加交错，
      // 从而挂在分支之外（getBranch 看不到）——只用分支会漏掉决议，刷新后审批状态就停在 pending
      const fileOrder = await session.getEntries();
      const positionOf = new Map(fileOrder.map((entry, index) => [entry.id, index] as const));

      // 审批决议按审批单 id 合并后，在请求条目的位置输出一行（携带最终状态）
      const decisions = new Map<string, ApprovalDecisionEntry>();
      for (const entry of fileOrder) {
        if (entry.type !== "custom" || entry.customType !== "approval_decision") continue;
        const data = entry.data as ApprovalDecisionEntry | undefined;
        if (data?.id) decisions.set(data.id, data);
      }
      const approvals: Array<{ at: number; row: { role: string; content: string } }> = [];
      for (const entry of fileOrder) {
        if (entry.type !== "custom" || entry.customType !== "approval_request") continue;
        const data = entry.data as ApprovalRequestEntry | undefined;
        if (!data?.id) continue;
        const decision = decisions.get(data.id);
        approvals.push({
          at: positionOf.get(entry.id) ?? fileOrder.length,
          row: {
            role: "approval",
            content: JSON.stringify({
              id: data.id,
              toolName: data.toolName,
              input: data.input ?? {},
              expiresAt: data.expiresAt ?? "",
              riskLevel: data.riskLevel ?? "low",
              ...(data.toolCallId ? { toolCallId: data.toolCallId } : {}),
              status: decision?.status ?? "pending",
              ...(decision?.reason ? { reason: decision.reason } : {}),
            }),
          },
        });
      }
      approvals.sort((left, right) => left.at - right.at);

      const rows: Array<{ role: string; content: string; model?: string; reasoning?: string }> = [];
      // 消息行在 rows 中的下标：limit 只作用于消息行，审批行不占额度（避免挤掉真实历史）
      const messageIndexes: number[] = [];
      let nextApproval = 0;
      /** 把位置在当前条目之前的审批行按文件顺序吐出（审批行不占 limit 额度） */
      const flushApprovalsBefore = (position: number): void => {
        while (nextApproval < approvals.length && approvals[nextApproval]!.at < position) {
          rows.push(approvals[nextApproval]!.row);
          nextApproval += 1;
        }
      };
      for (const entry of entries) {
        flushApprovalsBefore(positionOf.get(entry.id) ?? fileOrder.length);
        if (entry.type !== "message") continue;
        messageIndexes.push(rows.length);
        rows.push({
          role: entry.message.role,
          content: entry.message.content,
          ...(entry.message.model ? { model: entry.message.model } : {}),
          ...(entry.message.reasoning ? { reasoning: entry.message.reasoning } : {}),
        });
      }
      // 分支之后（或分支之外）的审批行补在末尾
      flushApprovalsBefore(fileOrder.length);
      while (nextApproval < approvals.length) {
        rows.push(approvals[nextApproval]!.row);
        nextApproval += 1;
      }
      if (limit && messageIndexes.length > limit) {
        return rows.slice(messageIndexes[messageIndexes.length - limit]!);
      }
      return rows;
    },

    async truncateSessionHistory(sessionId, scope, keepUserMessages): Promise<void> {
      const filePath = conversationPath(sessionId, scope);
      if (!(await readMetadata(sessionId, scope))) throw new Error("Session not found");
      if (!Number.isInteger(keepUserMessages) || keepUserMessages < 0) {
        throw new Error("Invalid keepUserMessages");
      }
      const content = await readFile(filePath, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());
      if (lines.length === 0) return;
      // 第 0 行是 session header，必须保留；找到第 keepUserMessages+1 条用户消息所在的行并截断
      const kept: string[] = [lines[0]!];
      let userCount = 0;
      let truncated = false;
      for (let i = 1; i < lines.length; i++) {
        let entry: { type?: string; message?: { role?: string } };
        try {
          entry = JSON.parse(lines[i]!) as { type?: string; message?: { role?: string } };
        } catch {
          truncated = true; // 无法解析的脏行视为边界，一并丢弃
          break;
        }
        if (entry.type === "message" && entry.message?.role === "user") {
          if (userCount >= keepUserMessages) {
            truncated = true;
            break;
          }
          userCount++;
        }
        kept.push(lines[i]!);
      }
      if (!truncated) return;
      await writeFile(filePath, `${kept.join("\n")}\n`, "utf-8");
    },

    async getArtifactRoot(sessionId, scope): Promise<string | null> {
      if (!(await readMetadata(sessionId, scope))) return null;
      const root = artifactRoot(sessionId, scope);
      await mkdir(root, { recursive: true });
      return root;
    },

    async writeArtifact(sessionId, scope, path, content): Promise<void> {
      if (!(await readMetadata(sessionId, scope)) || !path || path.includes('\0')) throw new Error('Session not found');
      const root = artifactRoot(sessionId, scope);
      const target = resolve(root, path);
      if (!isWithin(resolve(root), target)) throw new Error('Invalid artifact path');
      await mkdir(root, { recursive: true });
      const resolvedRoot = await realpath(root);
      await mkdir(dirname(target), { recursive: true });
      const resolvedParent = await realpath(dirname(target));
      if (!isWithin(resolvedRoot, resolvedParent)) throw new Error('Invalid artifact path');
      const existing = await lstat(target).catch(() => null);
      if (existing?.isSymbolicLink()) throw new Error('Invalid artifact path');
      await writeFile(target, content);
    },

    async listArtifacts(sessionId, scope): Promise<Array<{ path: string; size: number; modifiedAt: string }>> {
      if (!(await readMetadata(sessionId, scope))) return [];
      const root = artifactRoot(sessionId, scope);
      if (!existsSync(root)) return [];
      const resolvedRoot = await realpath(root);
      const files: Array<{ path: string; size: number; modifiedAt: string }> = [];
      async function walk(directory: string, relative: string, depth: number): Promise<void> {
        if (depth > 16 || files.length >= 1000) return;
        for (const item of await readdir(directory, { withFileTypes: true })) {
          if (item.isSymbolicLink()) continue;
          const itemPath = join(directory, item.name);
          const resolvedItem = await realpath(itemPath).catch(() => "");
          if (!resolvedItem || !isWithin(resolvedRoot, resolvedItem)) continue;
          const itemRelative = relative ? `${relative}/${item.name}` : item.name;
          if (item.isDirectory()) await walk(itemPath, itemRelative, depth + 1);
          else if (item.isFile()) {
            const info = await stat(itemPath);
            files.push({ path: itemRelative, size: info.size, modifiedAt: info.mtime.toISOString() });
          }
        }
      }
      await walk(root, "", 0);
      return files;
    },

    async readArtifact(sessionId, scope, path): Promise<{ path: string; content: string } | null> {
      if (!(await readMetadata(sessionId, scope)) || !path || path.includes("\0")) return null;
      const root = artifactRoot(sessionId, scope);
      const target = resolve(root, path);
      if (!isWithin(resolve(root), target) || !existsSync(target)) return null;
      const info = await lstat(target);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 2 * 1024 * 1024) return null;
      const resolvedRoot = await realpath(root);
      const resolvedTarget = await realpath(target);
      if (!isWithin(resolvedRoot, resolvedTarget)) return null;
      return { path, content: await readFile(resolvedTarget, "utf-8") };
    },

    async readArtifactBytes(sessionId, scope, path, maxBytes = 10 * 1024 * 1024): Promise<Uint8Array | null> {
      if (!(await readMetadata(sessionId, scope)) || !path || path.includes("\0")) return null;
      const root = artifactRoot(sessionId, scope);
      const target = resolve(root, path);
      if (!isWithin(resolve(root), target) || !existsSync(target)) return null;
      const info = await lstat(target);
      if (!info.isFile() || info.isSymbolicLink() || info.size > maxBytes) return null;
      const resolvedRoot = await realpath(root);
      const resolvedTarget = await realpath(target);
      if (!isWithin(resolvedRoot, resolvedTarget)) return null;
      return new Uint8Array(await readFile(resolvedTarget));
    },

    async getSessionRuntimeSandbox(sessionId, scope): Promise<string | null> {
      const filePath = conversationPath(sessionId, scope);
      if (!(await readMetadata(sessionId, scope))) return null;
      const entries = await createSession(await loadJsonlSessionStorage(filePath)).getEntries();
      const entry = entries.findLast((item) => item.type === "custom" && item.customType === "runtime_sandbox");
      if (entry?.type !== "custom") return null;
      const sandboxId = (entry.data as { sandboxId?: unknown }).sandboxId;
      return typeof sandboxId === "string" && sandboxId.length <= 256 ? sandboxId : null;
    },

    async setSessionRuntimeSandbox(sessionId, scope, sandboxId): Promise<void> {
      if (!sandboxId || sandboxId.length > 256) throw new Error("Invalid sandboxId");
      const filePath = conversationPath(sessionId, scope);
      if (!(await readMetadata(sessionId, scope))) throw new Error("Session not found");
      const session = createSession(await loadJsonlSessionStorage(filePath));
      await session.appendCustomEntry("runtime_sandbox", { sandboxId, createdAt: new Date().toISOString() });
    },

    async withSessionMemoryLock(sessionId, scope, task) {
      if (!(await readMetadata(sessionId, scope))) throw new Error("Session not found");
      const lockPath = `${sessionMemoryPath(sessionId, scope)}.lock`;
      await mkdir(dirname(lockPath), { recursive: true });
      let handle;
      try {
        handle = await open(lockPath, "wx");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const age = Date.now() - (await stat(lockPath)).mtimeMs;
        if (age <= 5 * 60_000) return { acquired: false };
        await rm(lockPath, { force: true });
        try {
          handle = await open(lockPath, "wx");
        } catch (retryError) {
          if ((retryError as NodeJS.ErrnoException).code === "EEXIST") return { acquired: false };
          throw retryError;
        }
      }
      try {
        await handle.writeFile(`${process.pid}:${new Date().toISOString()}\n`);
        return { acquired: true, result: await task() };
      } finally {
        await handle.close();
        await rm(lockPath, { force: true });
      }
    },

    async listPendingMemoryConsolidations() {
      if (!existsSync(storageRoot)) return [];
      const pending: Array<{ sessionId: string; scope: MemoryScope }> = [];
      for (const tenant of await readdir(storageRoot, { withFileTypes: true })) {
        if (!tenant.isDirectory() || !SAFE_ID.test(tenant.name)) continue;
        const usersRoot = join(storageRoot, tenant.name, "users");
        if (!existsSync(usersRoot)) continue;
        for (const user of await readdir(usersRoot, { withFileTypes: true })) {
          if (!user.isDirectory() || !SAFE_ID.test(user.name)) continue;
          const conversations = join(usersRoot, user.name, "conversations");
          if (!existsSync(conversations)) continue;
          for (const file of await readdir(conversations)) {
            if (!file.endsWith(".jsonl")) continue;
            const sessionId = file.slice(0, -6);
            if (!SAFE_ID.test(sessionId)) continue;
            const scope = { tenantId: tenant.name, userId: user.name };
            const state = await this.getSessionMemory(sessionId, scope);
            if (state?.status === "pending" || state?.status === "processing") pending.push({ sessionId, scope });
            if (pending.length >= 1000) return pending;
          }
        }
      }
      return pending;
    },

    async appendMemoryEvent(sessionId, scope, event): Promise<SessionMemoryEvent> {
      const filePath = conversationPath(sessionId, scope);
      if (!(await readMetadata(sessionId, scope))) throw new Error("Session not found");
      if (!event.content.trim() || event.content.length > 2000 || event.sourceMessageIds.length > 20) {
        throw new Error("Invalid memory event");
      }
      const stored: SessionMemoryEvent = {
        id: crypto.randomUUID(),
        type: event.type,
        content: event.content.trim(),
        sourceMessageIds: event.sourceMessageIds,
        createdAt: new Date().toISOString(),
      };
      const session = createSession(await loadJsonlSessionStorage(filePath));
      await session.appendCustomEntry("memory_event", stored);
      return stored;
    },

    async getSessionMemory(sessionId, scope): Promise<SessionMemoryState | null> {
      const filePath = conversationPath(sessionId, scope);
      if (!(await readMetadata(sessionId, scope))) return null;
      const entries = await createSession(await loadJsonlSessionStorage(filePath)).getEntries();
      const events = entries.flatMap((entry) => entry.type === "custom" && entry.customType === "memory_event"
        ? [entry.data as SessionMemoryEvent]
        : []);
      const statuses = entries.flatMap((entry) => entry.type === "custom" && entry.customType === "memory_consolidation_status"
        ? [entry.data as { status: SessionMemoryState["status"]; error?: string; processedEventIds?: string[] }]
        : []);
      const latest = statuses.at(-1);
      const processedEventIds = [...statuses].reverse().find((item) => item.processedEventIds)?.processedEventIds ?? [];
      const memoryPath = sessionMemoryPath(sessionId, scope);
      const content = existsSync(memoryPath) ? await readFile(memoryPath, "utf-8") : "# 会话记忆\n\n暂无已整理的记忆。\n";
      return { content, events, status: latest?.status ?? "idle", processedEventIds, ...(latest?.error ? { error: latest.error } : {}) };
    },

    async setMemoryConsolidationStatus(sessionId, scope, status, error, processedEventIds): Promise<void> {
      const filePath = conversationPath(sessionId, scope);
      if (!(await readMetadata(sessionId, scope))) throw new Error("Session not found");
      const session = createSession(await loadJsonlSessionStorage(filePath));
      await session.appendCustomEntry("memory_consolidation_status", {
        status,
        updatedAt: new Date().toISOString(),
        ...(error ? { error: error.slice(0, 500) } : {}),
        ...(processedEventIds ? { processedEventIds } : {}),
      });
    },

    async applyMemoryOperations(sessionId, scope, operations): Promise<void> {
      const filePath = conversationPath(sessionId, scope);
      if (!(await readMetadata(sessionId, scope))) throw new Error("Session not found");
      const session = createSession(await loadJsonlSessionStorage(filePath));
      const entries = await session.getEntries();
      const eventIds = new Set(entries.flatMap((entry) =>
        entry.type === "custom" && entry.customType === "memory_event"
          ? [(entry.data as SessionMemoryEvent).id]
          : []));
      const items = new Map<string, { content: string; confidence: number; sourceEventIds: string[] }>();
      for (const entry of entries) {
        if (entry.type !== "custom" || entry.customType !== "memory_operation") continue;
        const operation = entry.data as MemoryOperation;
        if (operation.op === "DELETE" || operation.op === "SUPERSEDE") items.delete(operation.id);
        if (operation.op === "ADD" || operation.op === "UPDATE") {
          items.set(operation.id, { content: operation.content, confidence: operation.confidence, sourceEventIds: operation.sourceEventIds });
        }
        if (operation.op === "SUPERSEDE") {
          items.set(operation.supersededBy, { content: operation.content, confidence: operation.confidence, sourceEventIds: operation.sourceEventIds });
        }
      }
      for (const operation of operations) {
        assertSafeId(operation.id, "memory id");
        if (operation.sourceEventIds.length === 0 || operation.sourceEventIds.length > 20 || operation.sourceEventIds.some((id) => !eventIds.has(id))) {
          throw new Error("Memory operation requires valid sources");
        }
        if (operation.op !== "DELETE" && (!operation.content.trim() || operation.content.length > 2000 || !Number.isFinite(operation.confidence) || operation.confidence < 0 || operation.confidence > 1)) {
          throw new Error("Invalid memory operation");
        }
        if (operation.op === "SUPERSEDE") assertSafeId(operation.supersededBy, "superseded memory id");
        if ((operation.op === "UPDATE" || operation.op === "DELETE" || operation.op === "SUPERSEDE") && !items.has(operation.id)) continue;
        if (operation.op === "ADD" && items.has(operation.id)) continue;
        if (operation.op === "DELETE" || operation.op === "SUPERSEDE") items.delete(operation.id);
        if (operation.op === "ADD" || operation.op === "UPDATE") items.set(operation.id, { content: operation.content, confidence: operation.confidence, sourceEventIds: operation.sourceEventIds });
        if (operation.op === "SUPERSEDE") items.set(operation.supersededBy, { content: operation.content, confidence: operation.confidence, sourceEventIds: operation.sourceEventIds });
        await session.appendCustomEntry("memory_operation", operation);
      }
      const lines = ["# 会话记忆", "", ...[...items.entries()].flatMap(([id, item]) => [
        `## ${id}`,
        "",
        item.content,
        "",
        `- 置信度：${item.confidence.toFixed(2)}`,
        `- 来源事件：${item.sourceEventIds.join(", ")}`,
        "",
      ])];
      const memoryPath = sessionMemoryPath(sessionId, scope);
      await mkdir(dirname(memoryPath), { recursive: true });
      const temporary = `${memoryPath}.${crypto.randomUUID()}.tmp`;
      await writeFile(temporary, `${lines.join("\n").trim()}\n`, "utf-8");
      await rename(temporary, memoryPath);
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

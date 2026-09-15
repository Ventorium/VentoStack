import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMemoryService } from "../../memory/service";
import { createMockDatabase } from "../helpers";

describe("tenant-scoped Memory", () => {
  let storagePath: string;

  beforeEach(async () => {
    storagePath = await mkdtemp(join(tmpdir(), "ai-memory-"));
  });

  afterEach(async () => {
    await rm(storagePath, { recursive: true, force: true });
  });

  test("uses JSONL Session as the conversation source of truth", async () => {
    const { db } = createMockDatabase();
    const memory = createMemoryService({ db, storagePath });
    const scope = { tenantId: "tenant-a", userId: "user-a" };
    const { sessionId } = await memory.createSession({ ...scope, agentId: "agent-a" });

    await memory.appendMessage(sessionId, scope, { role: "user", content: "Hello" });
    await memory.appendMessage(sessionId, scope, { role: "assistant", content: "Hi" });

    expect(await memory.getHistory(sessionId, scope)).toEqual([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ]);
    expect((await memory.getSession(sessionId, scope))?.messageCount).toBe(2);
    expect((await memory.listSessions(scope, "agent-a"))[0]?.sessionId).toBe(sessionId);
  });

  test("persists assistant reasoning alongside the message for replay", async () => {
    const { db } = createMockDatabase();
    const memory = createMemoryService({ db, storagePath });
    const scope = { tenantId: "tenant-a", userId: "user-a" };
    const { sessionId } = await memory.createSession({ ...scope, agentId: "agent-a" });

    await memory.appendMessage(sessionId, scope, { role: "user", content: "1+1?" });
    await memory.appendMessage(sessionId, scope, {
      role: "assistant",
      content: "2",
      model: "qwen3",
      reasoning: "个位相加，无进位",
    });
    // 未传 reasoning 的消息不应带上空字段
    await memory.appendMessage(sessionId, scope, { role: "user", content: "再来一题" });

    expect(await memory.getHistory(sessionId, scope)).toEqual([
      { role: "user", content: "1+1?" },
      { role: "assistant", content: "2", model: "qwen3", reasoning: "个位相加，无进位" },
      { role: "user", content: "再来一题" },
    ]);
  });

  test("does not discover or read a session through another tenant scope", async () => {
    const { db } = createMockDatabase();
    const memory = createMemoryService({ db, storagePath });
    const owner = { tenantId: "tenant-a", userId: "same-user" };
    const otherTenant = { tenantId: "tenant-b", userId: "same-user" };
    const { sessionId } = await memory.createSession({ ...owner, agentId: "agent-a" });
    await memory.appendMessage(sessionId, owner, { role: "user", content: "tenant secret" });

    expect(await memory.getSession(sessionId, otherTenant)).toBeNull();
    expect(await memory.getHistory(sessionId, otherTenant)).toEqual([]);
    expect(await memory.listSessions(otherTenant)).toEqual([]);
  });

  test("truncateSessionHistory keeps only the first N user turns for edit-resend", async () => {
    const { db } = createMockDatabase();
    const memory = createMemoryService({ db, storagePath });
    const scope = { tenantId: "tenant-a", userId: "user-a" };
    const { sessionId } = await memory.createSession({ ...scope, agentId: "agent-a" });
    await memory.appendMessage(sessionId, scope, { role: "user", content: "q1" });
    await memory.appendMessage(sessionId, scope, { role: "assistant", content: "a1" });
    await memory.appendMessage(sessionId, scope, { role: "user", content: "q2" });
    await memory.appendMessage(sessionId, scope, { role: "assistant", content: "a2" });

    // 编辑第 2 轮用户消息并重发：只保留第 1 轮
    await memory.truncateSessionHistory(sessionId, scope, 1);
    expect((await memory.getHistory(sessionId, scope)).map((m) => m.content)).toEqual(["q1", "a1"]);

    // 截断后可继续追加新消息（模拟重发）
    await memory.appendMessage(sessionId, scope, { role: "user", content: "q2-edited" });
    expect((await memory.getHistory(sessionId, scope)).map((m) => m.content)).toEqual([
      "q1",
      "a1",
      "q2-edited",
    ]);

    // keepUserMessages 覆盖全部轮次时不重写文件（无变化）
    await memory.truncateSessionHistory(sessionId, scope, 10);
    expect((await memory.getHistory(sessionId, scope)).map((m) => m.content)).toEqual([
      "q1",
      "a1",
      "q2-edited",
    ]);

    // 会话不存在时抛错
    await expect(memory.truncateSessionHistory("missing-session", scope, 1)).rejects.toThrow(
      "Session not found",
    );
  });

  test("isolates long-term memories by tenant and blocks path traversal", async () => {
    const { db } = createMockDatabase();
    const memory = createMemoryService({ db, storagePath });
    const first = { tenantId: "tenant-a", userId: "user-a" };
    const second = { tenantId: "tenant-b", userId: "user-a" };
    await memory.createLongTermMemory(first, "preferences", "dark mode");

    expect(await memory.readLongTermMemory(first, "preferences")).toContain("dark mode");
    expect(await memory.readLongTermMemory(second, "preferences")).toBeNull();
    await expect(memory.listSessions({ tenantId: "../escape", userId: "user-a" })).rejects.toThrow("Invalid tenantId");
  });

  test("forkSession creates an independent continuation session", async () => {
    const { db } = createMockDatabase();
    const memory = createMemoryService({ db, storagePath });
    const scope = { tenantId: "tenant-a", userId: "user-a" };
    const { sessionId } = await memory.createSession({ ...scope, agentId: "agent-a" });
    await memory.appendMessage(sessionId, scope, { role: "user", content: "hello" });
    await memory.appendMessage(sessionId, scope, { role: "assistant", content: "hi" });

    const { sessionId: forkId } = await memory.forkSession(sessionId, scope, { sessionId: "fork-session-1" });

    // 新会话继承历史且可独立演进
    const forkHistory = await memory.getHistory(forkId, scope);
    expect(forkHistory.map((m) => m.content)).toEqual(["hello", "hi"]);
    await memory.appendMessage(forkId, scope, { role: "user", content: "next" });
    expect((await memory.getHistory(forkId, scope)).map((m) => m.content)).toEqual(["hello", "hi", "next"]);

    // 源会话不受影响
    expect((await memory.getHistory(sessionId, scope)).map((m) => m.content)).toEqual(["hello", "hi"]);
    // 新会话归属同一 agent
    expect((await memory.getSession(forkId, scope))?.agentId).toBe("agent-a");
  });

  test("isolates artifacts by session and rejects traversal and symlink escape", async () => {
    const { db } = createMockDatabase();
    const memory = createMemoryService({ db, storagePath });
    const scope = { tenantId: "tenant-a", userId: "user-a" };
    const first = await memory.createSession({ ...scope, agentId: "agent-a" });
    const second = await memory.createSession({ ...scope, agentId: "agent-a" });
    const firstRoot = await memory.getArtifactRoot(first.sessionId, scope);
    expect(firstRoot).not.toBeNull();
    await writeFile(join(firstRoot!, "report.md"), "# first");
    const outside = join(storagePath, "outside.txt");
    await writeFile(outside, "secret");
    await symlink(outside, join(firstRoot!, "escape.txt"));

    expect(await memory.listArtifacts(first.sessionId, scope)).toEqual([
      expect.objectContaining({ path: "report.md", size: 7 }),
    ]);
    expect(await memory.listArtifacts(second.sessionId, scope)).toEqual([]);
    expect(await memory.readArtifact(first.sessionId, scope, "report.md")).toEqual({
      path: "report.md",
      content: "# first",
    });
    expect(await memory.readArtifact(first.sessionId, scope, "../outside.txt")).toBeNull();
    expect(await memory.readArtifact(first.sessionId, scope, "escape.txt")).toBeNull();

    await memory.writeArtifact(first.sessionId, scope, 'attachments/input.txt', new TextEncoder().encode('attached'));
    expect(await memory.readArtifact(first.sessionId, scope, 'attachments/input.txt')).toEqual({
      path: 'attachments/input.txt',
      content: 'attached',
    });
    await expect(memory.writeArtifact(first.sessionId, scope, '../escaped.txt', new Uint8Array())).rejects.toThrow('Invalid artifact path');
  });

  test("stores sourced session memory operations in MEMORY.md", async () => {
    const { db } = createMockDatabase();
    const memory = createMemoryService({ db, storagePath });
    const scope = { tenantId: "tenant-a", userId: "user-a" };
    const { sessionId } = await memory.createSession({ ...scope, agentId: "agent-a" });
    const concern = await memory.appendMemoryEvent(sessionId, scope, {
      type: "concern",
      content: "用户关注目录逃逸",
      sourceMessageIds: [],
    });
    const correction = await memory.appendMemoryEvent(sessionId, scope, {
      type: "correction",
      content: "不需要永久每用户 VM",
      sourceMessageIds: [],
    });

    await memory.applyMemoryOperations(sessionId, scope, [
      { op: "ADD", id: "filesystem-boundary", content: "必须阻止目录逃逸", confidence: 0.95, sourceEventIds: [concern.id] },
      { op: "ADD", id: "runtime-model", content: "每用户永久 VM", confidence: 0.5, sourceEventIds: [concern.id] },
      { op: "SUPERSEDE", id: "runtime-model", supersededBy: "runtime-isolation", content: "会话需要隔离，但不需要永久每用户 VM", confidence: 0.98, sourceEventIds: [correction.id] },
    ]);

    const state = await memory.getSessionMemory(sessionId, scope);
    expect(state?.events).toHaveLength(2);
    expect(state?.content).toContain("必须阻止目录逃逸");
    expect(state?.content).toContain("不需要永久每用户 VM");
    expect(state?.content).not.toContain("## runtime-model");
    await expect(memory.applyMemoryOperations(sessionId, scope, [
      { op: "ADD", id: "forged", content: "伪造来源", confidence: 1, sourceEventIds: ["unknown-event"] },
    ])).rejects.toThrow("valid sources");
  });

  test("stores runtime sandbox bindings per session and scope", async () => {
    const { db } = createMockDatabase();
    const memory = createMemoryService({ db, storagePath });
    const scope = { tenantId: "tenant-a", userId: "user-a" };
    const otherUser = { tenantId: "tenant-a", userId: "user-b" };
    const first = await memory.createSession({ ...scope, agentId: "agent-a" });
    const second = await memory.createSession({ ...scope, agentId: "agent-a" });

    await memory.setSessionRuntimeSandbox(first.sessionId, scope, "sandbox-first");

    expect(await memory.getSessionRuntimeSandbox(first.sessionId, scope)).toBe("sandbox-first");
    expect(await memory.getSessionRuntimeSandbox(second.sessionId, scope)).toBeNull();
    expect(await memory.getSessionRuntimeSandbox(first.sessionId, otherUser)).toBeNull();
  });

  test("discovers pending memory work for restart recovery", async () => {
    const { db } = createMockDatabase();
    const memory = createMemoryService({ db, storagePath });
    const scope = { tenantId: "tenant-a", userId: "user-a" };
    const { sessionId } = await memory.createSession({ ...scope, agentId: "agent-a" });
    await memory.setMemoryConsolidationStatus(sessionId, scope, "pending");

    expect(await memory.listPendingMemoryConsolidations()).toEqual([{ sessionId, scope }]);
  });
});

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
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
});

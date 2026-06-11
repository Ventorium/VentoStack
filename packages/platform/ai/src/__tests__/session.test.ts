/**
 * Session 树形存储 + Compaction 测试
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createJsonlSessionStorage, loadJsonlSessionStorage } from "../session/jsonl-storage";
import { createSession } from "../session/session";
import { prepareCompaction, estimateTokenCount, DEFAULT_COMPACTION_SETTINGS } from "../compaction/compaction";
import type { SessionTreeEntry, MessageEntry } from "../session/types";

describe("Session", () => {
  let tempDir: string;
  let sessionPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "session-test-"));
    sessionPath = join(tempDir, "test-session.jsonl");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("create session and append messages", async () => {
    const storage = await createJsonlSessionStorage(sessionPath, {
      cwd: "/test",
      sessionId: "test-123",
    });
    const session = createSession(storage);

    const msgId = await session.appendMessage({
      role: "user",
      content: "Hello",
      timestamp: Date.now(),
    });
    expect(msgId).toBeDefined();

    const context = await session.buildContext();
    expect(context.messages).toHaveLength(1);
    expect(context.messages[0]!.content).toBe("Hello");
  });

  test("session tree navigation with moveTo", async () => {
    const storage = await createJsonlSessionStorage(sessionPath, {
      cwd: "/test",
      sessionId: "test-456",
    });
    const session = createSession(storage);

    // Add messages
    await session.appendMessage({ role: "user", content: "First", timestamp: Date.now() });
    const secondId = await session.appendMessage({ role: "assistant", content: "Response 1", timestamp: Date.now() });
    await session.appendMessage({ role: "user", content: "Second", timestamp: Date.now() });
    await session.appendMessage({ role: "assistant", content: "Response 2", timestamp: Date.now() });

    // Move back to second message
    await session.moveTo(secondId, { summary: "Going back to first response" });

    const context = await session.buildContext();
    // Should have: First user msg + First assistant + Branch summary
    expect(context.messages.length).toBeLessThanOrEqual(4);
    const contents = context.messages.map((m) => m.content);
    expect(contents).toContain("First");
    expect(contents).toContain("Response 1");
  });

  test("load existing session", async () => {
    // Create session first
    const storage1 = await createJsonlSessionStorage(sessionPath, {
      cwd: "/test",
      sessionId: "test-789",
    });
    const session1 = createSession(storage1);
    await session1.appendMessage({ role: "user", content: "Persisted", timestamp: Date.now() });

    // Load from file
    const storage2 = await loadJsonlSessionStorage(sessionPath);
    const session2 = createSession(storage2);

    const context = await session2.buildContext();
    expect(context.messages).toHaveLength(1);
    expect(context.messages[0]!.content).toBe("Persisted");
  });

  test("append model and thinking level changes", async () => {
    const storage = await createJsonlSessionStorage(sessionPath, {
      cwd: "/test",
      sessionId: "test-model",
    });
    const session = createSession(storage);

    await session.appendModelChange("anthropic", "claude-sonnet-4-20250514");
    await session.appendThinkingLevelChange("high");
    await session.appendMessage({ role: "user", content: "Test", timestamp: Date.now() });

    const context = await session.buildContext();
    expect(context.model).toEqual({ provider: "anthropic", modelId: "claude-sonnet-4-20250514" });
    expect(context.thinkingLevel).toBe("high");
  });

  test("session name management", async () => {
    const storage = await createJsonlSessionStorage(sessionPath, {
      cwd: "/test",
      sessionId: "test-name",
    });
    const session = createSession(storage);

    await session.appendSessionName("My Session");
    const name = await session.getSessionName();
    expect(name).toBe("My Session");
  });

  test("custom entries", async () => {
    const storage = await createJsonlSessionStorage(sessionPath, {
      cwd: "/test",
      sessionId: "test-custom",
    });
    const session = createSession(storage);

    await session.appendCustomEntry("checkpoint", { status: "ok" });
    const entries = await session.getEntries();
    const customEntries = entries.filter((e) => e.type === "custom");
    expect(customEntries).toHaveLength(1);
  });
});

describe("Compaction", () => {
  test("estimateTokenCount handles mixed content", () => {
    const tokens = estimateTokenCount("Hello 你好世界 test");
    expect(tokens).toBeGreaterThan(0);
    // Chinese chars * 1.5 + English chars / 4
    expect(tokens).toBe(Math.ceil(4 * 1.5 + 11 / 4)); // 11 = non-Chinese chars including spaces
  });

  test("prepareCompaction returns null when under budget", () => {
    const entries: SessionTreeEntry[] = [
      {
        type: "message",
        id: "1",
        parentId: null,
        timestamp: new Date().toISOString(),
        message: { role: "user", content: "Short message", timestamp: Date.now() },
      },
    ];

    const result = prepareCompaction(entries, DEFAULT_COMPACTION_SETTINGS);
    expect(result).toBeNull();
  });

  test("prepareCompaction finds cut point with enough messages", () => {
    // Generate many messages to exceed the budget
    const entries: SessionTreeEntry[] = [];
    for (let i = 0; i < 100; i++) {
      entries.push({
        type: "message",
        id: String(i),
        parentId: i > 0 ? String(i - 1) : null,
        timestamp: new Date().toISOString(),
        message: {
          role: i % 2 === 0 ? "user" : "assistant",
          content: `Message ${i}: ${"x".repeat(500)}`,
          timestamp: Date.now(),
        },
      });
    }

    const settings = { enabled: true, reserveTokens: 1000, keepRecentTokens: 5000 };
    const result = prepareCompaction(entries, settings);
    expect(result).not.toBeNull();
    expect(result!.tokensBefore).toBeGreaterThan(0);
    expect(result!.firstKeptEntryId).toBeDefined();
  });
});

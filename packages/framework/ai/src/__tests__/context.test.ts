import { describe, expect, test } from "bun:test";
import { createContextManager } from "../context";

describe("ContextManager", () => {
  test("create 新对话", () => {
    const manager = createContextManager();
    const ctx = manager.create();
    expect(ctx.conversationId).toBeDefined();
    expect(ctx.messages).toHaveLength(0);
    expect(ctx.createdAt).toBeGreaterThan(0);
  });

  test("create 带 system prompt", () => {
    const manager = createContextManager();
    const ctx = manager.create("You are a helpful assistant.");
    expect(ctx.messages).toHaveLength(1);
    expect(ctx.messages[0]!.role).toBe("system");
    expect(ctx.messages[0]!.content).toBe("You are a helpful assistant.");
  });

  test("addMessage user/assistant/tool", () => {
    const manager = createContextManager();
    const ctx = manager.create();
    const id = ctx.conversationId;

    const userMsg = manager.addMessage(id, "user", "Hello");
    expect(userMsg).not.toBeNull();
    expect(userMsg!.role).toBe("user");

    const assistantMsg = manager.addMessage(id, "assistant", "Hi there");
    expect(assistantMsg!.role).toBe("assistant");

    const toolMsg = manager.addMessage(id, "tool", '{"result": 42}', "call-1");
    expect(toolMsg!.role).toBe("tool");
    expect(toolMsg!.toolCallId).toBe("call-1");
  });

  test("getHistory 全部", () => {
    const manager = createContextManager();
    const ctx = manager.create("System");
    const id = ctx.conversationId;
    manager.addMessage(id, "user", "Hello");
    manager.addMessage(id, "assistant", "Hi");

    const history = manager.getHistory(id);
    expect(history).toHaveLength(3);
  });

  test("getHistory 带 limit", () => {
    const manager = createContextManager();
    const ctx = manager.create("System");
    const id = ctx.conversationId;
    manager.addMessage(id, "user", "Hello");
    manager.addMessage(id, "assistant", "Hi");
    manager.addMessage(id, "user", "How are you?");

    const history = manager.getHistory(id, 2);
    expect(history).toHaveLength(2);
    expect(history[0]!.content).toBe("Hi");
    expect(history[1]!.content).toBe("How are you?");
  });

  test("setMetadata", () => {
    const manager = createContextManager();
    const ctx = manager.create();
    const id = ctx.conversationId;
    expect(manager.setMetadata(id, "model", "gpt-4")).toBe(true);
    expect(manager.get(id)!.metadata.model).toBe("gpt-4");
    expect(manager.setMetadata("nonexistent", "key", "val")).toBe(false);
  });

  test("destroy 删除", () => {
    const manager = createContextManager();
    const ctx = manager.create();
    expect(manager.destroy(ctx.conversationId)).toBe(true);
    expect(manager.get(ctx.conversationId)).toBeNull();
    expect(manager.destroy(ctx.conversationId)).toBe(false);
  });

  test("listActive 列表", () => {
    const manager = createContextManager();
    const ctx1 = manager.create();
    const ctx2 = manager.create();
    const active = manager.listActive();
    expect(active).toHaveLength(2);
    expect(active).toContain(ctx1.conversationId);
    expect(active).toContain(ctx2.conversationId);
  });

  test("truncate 截断", () => {
    const manager = createContextManager();
    const ctx = manager.create("System");
    const id = ctx.conversationId;
    manager.addMessage(id, "user", "1");
    manager.addMessage(id, "assistant", "2");
    manager.addMessage(id, "user", "3");
    manager.addMessage(id, "assistant", "4");
    // 5 messages total (1 system + 4)
    const removed = manager.truncate(id, 3);
    expect(removed).toBe(2);
    expect(manager.getHistory(id)).toHaveLength(3);
  });

  test("get 不存在返回 null", () => {
    const manager = createContextManager();
    expect(manager.get("nonexistent")).toBeNull();
  });

  test("addMessage 不存在的对话返回 null", () => {
    const manager = createContextManager();
    expect(manager.addMessage("nonexistent", "user", "hello")).toBeNull();
  });

  test("getHistory 不存在的对话返回空数组", () => {
    const manager = createContextManager();
    expect(manager.getHistory("nonexistent")).toEqual([]);
  });

  test("truncate 不存在的对话返回 0", () => {
    const manager = createContextManager();
    expect(manager.truncate("nonexistent", 5)).toBe(0);
  });
});

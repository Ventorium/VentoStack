/**
 * Agent 事件系统 + 消息队列测试
 */
import { describe, test, expect } from "bun:test";
import { createEventEmitter } from "../agent-engine/events";
import { createMessageQueue } from "../agent-engine/message-queue";
import type { AgentEvent } from "../agent-engine/events";

describe("EventEmitter", () => {
  test("wildcard handler receives all events", async () => {
    const emitter = createEventEmitter();
    const received: string[] = [];

    emitter.on((event) => {
      received.push(event.type);
    });

    await emitter.emit({ type: "agent_start" });
    await emitter.emit({ type: "turn_start" });
    await emitter.emit({ type: "agent_end", messages: [] });

    expect(received).toEqual(["agent_start", "turn_start", "agent_end"]);
  });

  test("typed handler receives only matching events", async () => {
    const emitter = createEventEmitter();
    let count = 0;

    emitter.onType("tool_execution_start", () => {
      count++;
    });

    await emitter.emit({ type: "agent_start" });
    await emitter.emit({ type: "tool_execution_start", toolCallId: "1", toolName: "test", args: {} });
    await emitter.emit({ type: "agent_end", messages: [] });

    expect(count).toBe(1);
  });

  test("unsubscribe stops receiving events", async () => {
    const emitter = createEventEmitter();
    let count = 0;

    const unsub = emitter.on(() => { count++; });
    await emitter.emit({ type: "agent_start" });
    expect(count).toBe(1);

    unsub();
    await emitter.emit({ type: "agent_start" });
    expect(count).toBe(1);
  });

  test("clear removes all handlers", async () => {
    const emitter = createEventEmitter();
    let count = 0;

    emitter.on(() => { count++; });
    emitter.onType("turn_start", () => { count++; });

    emitter.clear();
    await emitter.emit({ type: "agent_start" });
    await emitter.emit({ type: "turn_start" });

    expect(count).toBe(0);
  });
});

describe("MessageQueue", () => {
  test("all mode drains all messages", () => {
    const queue = createMessageQueue<string>("all");
    queue.enqueue("a");
    queue.enqueue("b");
    queue.enqueue("c");

    const drained = queue.drain();
    expect(drained).toEqual(["a", "b", "c"]);
    expect(queue.size()).toBe(0);
  });

  test("one-at-a-time mode drains one message", () => {
    const queue = createMessageQueue<string>("one-at-a-time");
    queue.enqueue("a");
    queue.enqueue("b");

    const first = queue.drain();
    expect(first).toEqual(["a"]);
    expect(queue.size()).toBe(1);

    const second = queue.drain();
    expect(second).toEqual(["b"]);
    expect(queue.size()).toBe(0);
  });

  test("hasItems returns correct state", () => {
    const queue = createMessageQueue<number>();
    expect(queue.hasItems()).toBe(false);
    queue.enqueue(1);
    expect(queue.hasItems()).toBe(true);
    queue.drain();
    expect(queue.hasItems()).toBe(false);
  });

  test("clear returns and removes all items", () => {
    const queue = createMessageQueue<string>();
    queue.enqueue("x");
    queue.enqueue("y");

    const cleared = queue.clear();
    expect(cleared).toEqual(["x", "y"]);
    expect(queue.size()).toBe(0);
  });

  test("mode can be changed", () => {
    const queue = createMessageQueue<string>("all");
    queue.enqueue("a");
    queue.enqueue("b");

    queue.setMode("one-at-a-time");
    expect(queue.drain()).toEqual(["a"]);
    expect(queue.drain()).toEqual(["b"]);
  });
});

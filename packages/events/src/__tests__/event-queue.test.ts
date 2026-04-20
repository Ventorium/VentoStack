import { describe, test, expect, beforeEach } from "bun:test";
import { createEventQueue } from "../event-queue";

describe("createEventQueue", () => {
  let queue: ReturnType<typeof createEventQueue>;

  beforeEach(() => {
    queue = createEventQueue({ maxSize: 100 });
  });

  test("enqueue adds event and returns id", () => {
    const id = queue.enqueue("click", { x: 1 });
    expect(id).toBeDefined();
    expect(queue.size()).toBe(1);
  });

  test("enqueue throws when full", () => {
    const q = createEventQueue({ maxSize: 2 });
    q.enqueue("a", 1);
    q.enqueue("b", 2);
    expect(() => q.enqueue("c", 3)).toThrow("queue full");
  });

  test("process handles events", async () => {
    const processed: string[] = [];
    queue.enqueue("a", "x");
    queue.enqueue("b", "y");
    await queue.process(async (event) => { processed.push(event.name); });
    expect(processed).toContain("a");
  });

  test("process respects concurrency", async () => {
    const q = createEventQueue({ concurrency: 2 });
    q.enqueue("a", 1);
    q.enqueue("b", 2);
    q.enqueue("c", 3);
    const processed: string[] = [];
    await q.process(async (event) => { processed.push(event.name); });
    expect(processed).toHaveLength(2); // concurrency=2
    expect(q.size()).toBe(1); // one left
  });

  test("higher priority events processed first", () => {
    queue.enqueue("low", "l", 0);
    queue.enqueue("high", "h", 10);
    queue.enqueue("mid", "m", 5);
    const pending = queue.pending();
    expect(pending[0].name).toBe("high");
    expect(pending[1].name).toBe("mid");
    expect(pending[2].name).toBe("low");
  });

  test("failed event is re-queued with lower priority", async () => {
    queue.enqueue("fail", "data", 5);
    await queue.process(async () => { throw new Error("oops"); });
    expect(queue.size()).toBe(1);
    expect(queue.pending()[0].priority).toBe(4);
  });

  test("clear empties the queue", () => {
    queue.enqueue("a", 1);
    queue.enqueue("b", 2);
    queue.clear();
    expect(queue.size()).toBe(0);
  });

  test("pause prevents processing", async () => {
    queue.enqueue("a", 1);
    queue.pause();
    expect(queue.isPaused()).toBe(true);
    const processed: string[] = [];
    await queue.process(async (event) => { processed.push(event.name); });
    expect(processed).toHaveLength(0);
    expect(queue.size()).toBe(1);
  });

  test("resume allows processing again", async () => {
    queue.enqueue("a", 1);
    queue.pause();
    queue.resume();
    expect(queue.isPaused()).toBe(false);
    const processed: string[] = [];
    await queue.process(async (event) => { processed.push(event.name); });
    expect(processed).toHaveLength(1);
  });

  test("drain clears the queue", async () => {
    queue.enqueue("a", 1);
    queue.enqueue("b", 2);
    await queue.drain();
    expect(queue.size()).toBe(0);
  });

  test("pending returns copy of queue", () => {
    queue.enqueue("a", 1);
    const pending = queue.pending();
    expect(pending).toHaveLength(1);
    pending.pop(); // mutating copy shouldn't affect queue
    expect(queue.size()).toBe(1);
  });
});

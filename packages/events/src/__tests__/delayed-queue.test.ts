import { describe, expect, test } from "bun:test";
import { createDelayedQueue } from "../delayed-queue";
import type { DelayedMessage } from "../delayed-queue";

describe("createDelayedQueue", () => {
  test("schedule returns a unique id", () => {
    const queue = createDelayedQueue(async () => {});
    const id1 = queue.schedule("t", "a", 1000);
    const id2 = queue.schedule("t", "b", 1000);
    expect(id1).toBeString();
    expect(id2).toBeString();
    expect(id1).not.toBe(id2);
  });

  test("pending returns the number of scheduled messages", () => {
    const queue = createDelayedQueue(async () => {});
    expect(queue.pending()).toBe(0);
    queue.schedule("t", "a", 1000);
    queue.schedule("t", "b", 2000);
    expect(queue.pending()).toBe(2);
  });

  test("cancel removes a scheduled message and returns true", () => {
    const queue = createDelayedQueue(async () => {});
    const id = queue.schedule("t", "data", 5000);
    expect(queue.pending()).toBe(1);
    expect(queue.cancel(id)).toBe(true);
    expect(queue.pending()).toBe(0);
  });

  test("cancel returns false for unknown id", () => {
    const queue = createDelayedQueue(async () => {});
    expect(queue.cancel("nonexistent")).toBe(false);
  });

  test("executes messages after delay expires", async () => {
    const executed: DelayedMessage[] = [];
    const queue = createDelayedQueue(async (msg) => {
      executed.push(msg);
    });

    queue.schedule("topic-a", "payload-1", 30);
    queue.schedule("topic-b", "payload-2", 60);
    queue.start(20);

    await Bun.sleep(150);
    queue.stop();

    expect(executed).toHaveLength(2);
    expect(executed[0]!.payload).toBe("payload-1");
    expect(executed[1]!.payload).toBe("payload-2");
  });

  test("does not execute cancelled messages", async () => {
    const executed: unknown[] = [];
    const queue = createDelayedQueue(async (msg) => {
      executed.push(msg.payload);
    });

    const id = queue.schedule("t", "cancel-me", 30);
    queue.schedule("t", "keep-me", 30);
    queue.cancel(id);

    queue.start(20);
    await Bun.sleep(150);
    queue.stop();

    expect(executed).toEqual(["keep-me"]);
  });

  test("stop halts the poll loop", async () => {
    const executed: unknown[] = [];
    const queue = createDelayedQueue(async (msg) => {
      executed.push(msg.payload);
    });

    queue.schedule("t", "early", 20);
    queue.schedule("t", "late", 300);

    queue.start(20);
    await Bun.sleep(100);
    queue.stop();

    // Wait past the late message's delay
    await Bun.sleep(400);

    expect(executed).toEqual(["early"]);
    expect(queue.pending()).toBe(1);
  });

  test("handler errors do not crash the poll loop", async () => {
    let callCount = 0;
    const queue = createDelayedQueue(async () => {
      callCount++;
      if (callCount === 1) throw new Error("boom");
    });

    queue.schedule("t", "first", 10);
    queue.schedule("t", "second", 40);

    queue.start(20);
    await Bun.sleep(150);
    queue.stop();

    expect(callCount).toBe(2);
  });

  test("messages are processed in order of executeAt", async () => {
    const order: string[] = [];
    const queue = createDelayedQueue(async (msg) => {
      order.push(msg.payload as string);
    });

    // Schedule in reverse order but with ascending delays
    queue.schedule("t", "third", 80);
    queue.schedule("t", "first", 20);
    queue.schedule("t", "second", 50);

    queue.start(15);
    await Bun.sleep(200);
    queue.stop();

    expect(order).toEqual(["first", "second", "third"]);
  });

  test("start is idempotent — calling multiple times does not create multiple intervals", async () => {
    let callCount = 0;
    const queue = createDelayedQueue(async () => {
      callCount++;
    });

    queue.schedule("t", "data", 20);
    queue.start(20);
    queue.start(20); // should be no-op
    queue.start(20); // should be no-op

    await Bun.sleep(100);
    queue.stop();

    expect(callCount).toBe(1);
  });
});

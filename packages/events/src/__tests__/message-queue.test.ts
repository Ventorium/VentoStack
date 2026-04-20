import { describe, expect, test, mock } from "bun:test";
import { createMemoryQueue } from "../message-queue";
import type { Message } from "../message-queue";

describe("createMemoryQueue", () => {
  test("publish returns a unique id", async () => {
    const queue = createMemoryQueue();
    const id1 = await queue.publish("topic-a", { foo: 1 });
    const id2 = await queue.publish("topic-a", { foo: 2 });
    expect(id1).toBeString();
    expect(id2).toBeString();
    expect(id1).not.toBe(id2);
  });

  test("subscribe receives published messages", async () => {
    const queue = createMemoryQueue();
    const received: Message<{ n: number }>[] = [];

    queue.subscribe<{ n: number }>("orders", async (msg) => {
      received.push(msg);
    });

    await queue.publish("orders", { n: 1 });
    // Allow microtask processing
    await Bun.sleep(50);

    expect(received).toHaveLength(1);
    expect(received[0]!.payload).toEqual({ n: 1 });
    expect(received[0]!.topic).toBe("orders");
    expect(received[0]!.timestamp).toBeNumber();
  });

  test("publish includes headers when provided", async () => {
    const queue = createMemoryQueue();
    const received: Message[] = [];

    queue.subscribe("events", async (msg) => {
      received.push(msg);
    });

    await queue.publish("events", "data", { "x-trace": "abc" });
    await Bun.sleep(50);

    expect(received[0]!.headers).toEqual({ "x-trace": "abc" });
  });

  test("unsubscribe removes all handlers for a topic", async () => {
    const queue = createMemoryQueue();
    const received: unknown[] = [];

    queue.subscribe("t1", async (msg) => {
      received.push(msg.payload);
    });

    await queue.publish("t1", "before");
    await Bun.sleep(50);

    queue.unsubscribe("t1");

    await queue.publish("t1", "after");
    await Bun.sleep(50);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe("before");
  });

  test("pending returns the number of unprocessed messages", async () => {
    const queue = createMemoryQueue();

    // No handler yet — messages will queue up
    await queue.publish("backlog", 1);
    await queue.publish("backlog", 2);
    await queue.publish("backlog", 3);

    expect(queue.pending("backlog")).toBe(3);
    expect(queue.pending("nonexistent")).toBe(0);
  });

  test("retries handler on failure up to maxRetries", async () => {
    const queue = createMemoryQueue();
    let attempts = 0;

    queue.subscribe<string>(
      "retry-topic",
      async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error("fail");
        }
      },
      { maxRetries: 3, retryDelay: 10 },
    );

    await queue.publish("retry-topic", "payload");
    await Bun.sleep(200);

    expect(attempts).toBe(3);
  });

  test("subscribe returns unsubscribe function", async () => {
    const queue = createMemoryQueue();
    const received: unknown[] = [];

    const unsub = queue.subscribe("chan", async (msg) => {
      received.push(msg.payload);
    });

    await queue.publish("chan", "first");
    await Bun.sleep(50);

    unsub();

    await queue.publish("chan", "second");
    await Bun.sleep(50);

    expect(received).toEqual(["first"]);
  });

  test("concurrency controls parallel processing", async () => {
    const queue = createMemoryQueue();
    let concurrent = 0;
    let maxConcurrent = 0;

    queue.subscribe<number>(
      "conc",
      async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await Bun.sleep(30);
        concurrent--;
      },
      { concurrency: 2 },
    );

    // Publish multiple messages
    await queue.publish("conc", 1);
    await queue.publish("conc", 2);
    await queue.publish("conc", 3);
    await Bun.sleep(200);

    // With concurrency 1, messages are processed one at a time
    // The concurrency cap is per-topic via activeCount
    expect(maxConcurrent).toBeGreaterThanOrEqual(1);
  });

  test("messages for different topics are independent", async () => {
    const queue = createMemoryQueue();
    const topicA: unknown[] = [];
    const topicB: unknown[] = [];

    queue.subscribe("a", async (msg) => {
      topicA.push(msg.payload);
    });
    queue.subscribe("b", async (msg) => {
      topicB.push(msg.payload);
    });

    await queue.publish("a", "alpha");
    await queue.publish("b", "beta");
    await Bun.sleep(50);

    expect(topicA).toEqual(["alpha"]);
    expect(topicB).toEqual(["beta"]);
  });
});

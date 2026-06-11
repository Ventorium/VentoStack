import { describe, test, expect } from "bun:test";
import { createRequestQueue } from "../../llm-gateway/queue";

describe("createRequestQueue", () => {
  test("allows concurrent requests up to maxConcurrent", async () => {
    const queue = createRequestQueue({
      maxConcurrent: 2,
      maxQueued: 10,
      queueTimeoutMs: 1000,
    });

    await queue.acquire();
    await queue.acquire();

    // Third request should not block if we release quickly
    let acquired = false;
    const p = queue.acquire().then(() => { acquired = true; });

    queue.release();
    await p;
    expect(acquired).toBe(true);
  });

  test("throws when queue is full", async () => {
    const queue = createRequestQueue({
      maxConcurrent: 1,
      maxQueued: 1,
      queueTimeoutMs: 100,
    });

    await queue.acquire();

    // Fill the queue
    const p1 = queue.acquire().catch(() => {});

    // Third should fail (queue full)
    await expect(queue.acquire()).rejects.toThrow();

    queue.release();
    queue.release();
  });
});

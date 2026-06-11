import { describe, test, expect } from "bun:test";
import { createDistributedLock } from "../../agent-engine/distributed-lock";
import { createMockCache } from "../helpers";

describe("createDistributedLock", () => {
  test("acquires and releases lock", async () => {
    const cache = createMockCache();
    const lock = createDistributedLock(cache as never);

    const acquired = await lock.acquire("test-key");
    expect(acquired).toBe(true);

    await lock.release("test-key");
  });

  test("prevents double acquisition", async () => {
    const cache = createMockCache();
    const lock = createDistributedLock(cache as never);

    const acquired1 = await lock.acquire("test-key");
    expect(acquired1).toBe(true);

    const acquired2 = await lock.acquire("test-key");
    expect(acquired2).toBe(false);

    await lock.release("test-key");
  });

  test("withLock executes and releases", async () => {
    const cache = createMockCache();
    const lock = createDistributedLock(cache as never);

    const result = await lock.withLock("test-key", async () => {
      return 42;
    });

    expect(result).toBe(42);
    // Lock should be released, can acquire again
    const acquired = await lock.acquire("test-key");
    expect(acquired).toBe(true);
  });

  test("withLock releases on error", async () => {
    const cache = createMockCache();
    const lock = createDistributedLock(cache as never);

    try {
      await lock.withLock("test-key", async () => {
        throw new Error("boom");
      });
    } catch {
      // expected
    }

    // Lock should be released after error
    const acquired = await lock.acquire("test-key");
    expect(acquired).toBe(true);
  });
});

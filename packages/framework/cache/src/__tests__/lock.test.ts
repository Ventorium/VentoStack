import { describe, expect, test } from "bun:test";
import { createLock } from "../lock";
import { createMemoryAdapter } from "../memory-adapter";

function setup() {
  const adapter = createMemoryAdapter();
  const lock = createLock(adapter);
  return { adapter, lock };
}

describe("createLock", () => {
  test("uses setNX atomic path when adapter supports it", async () => {
    let setNXCalled = false;
    const adapter = {
      ...createMemoryAdapter(),
      setNX: async (key: string, value: string, ttlSeconds: number) => {
        setNXCalled = true;
        const exists = await adapter.has(key);
        if (exists) return false;
        await adapter.set(key, value, ttlSeconds);
        return true;
      },
    };
    const lock = createLock(adapter);

    const l1 = await lock.acquire("atomic-resource");
    expect(l1.acquired).toBe(true);
    expect(setNXCalled).toBe(true);

    // 再次获取应失败（锁已存在），且仍走 setNX 原子路径
    const l2 = await lock.acquire("atomic-resource");
    expect(l2.acquired).toBe(false);
    expect(setNXCalled).toBe(true);
  });
  test("acquire succeeds when lock is free", async () => {
    const { lock } = setup();
    const l = await lock.acquire("resource");
    expect(l.acquired).toBe(true);
  });

  test("acquire fails when lock is held", async () => {
    const { lock } = setup();
    const l1 = await lock.acquire("resource");
    expect(l1.acquired).toBe(true);
    const l2 = await lock.acquire("resource");
    expect(l2.acquired).toBe(false);
  });

  test("release allows re-acquire", async () => {
    const { lock } = setup();
    const l1 = await lock.acquire("resource");
    await l1.release();
    const l2 = await lock.acquire("resource");
    expect(l2.acquired).toBe(true);
  });

  test("release is idempotent", async () => {
    const { lock } = setup();
    const l = await lock.acquire("resource");
    await l.release();
    await l.release(); // no-op, should not throw
  });

  test("lock key uses lock: prefix", async () => {
    const { adapter, lock } = setup();
    await lock.acquire("myresource");
    expect(await adapter.has("lock:myresource")).toBe(true);
  });

  test("lock expires after TTL", async () => {
    const { lock } = setup();
    const l1 = await lock.acquire("resource", { ttl: 1 });
    expect(l1.acquired).toBe(true);
    await Bun.sleep(1100);
    // Lock should have expired, new acquire should succeed
    const l2 = await lock.acquire("resource");
    expect(l2.acquired).toBe(true);
  });

  test("acquire with retries succeeds after release", async () => {
    const { lock } = setup();
    const l1 = await lock.acquire("resource");

    // Release after 100ms
    setTimeout(async () => {
      await l1.release();
    }, 100);

    const l2 = await lock.acquire("resource", { retries: 3, retryDelay: 100 });
    expect(l2.acquired).toBe(true);
    await l2.release();
  });

  test("acquire with retries fails if never freed", async () => {
    const { lock } = setup();
    await lock.acquire("resource", { ttl: 30 });
    const l2 = await lock.acquire("resource", { retries: 2, retryDelay: 50 });
    expect(l2.acquired).toBe(false);
  });

  test("release on failed lock is no-op", async () => {
    const { lock } = setup();
    await lock.acquire("resource");
    const l2 = await lock.acquire("resource");
    expect(l2.acquired).toBe(false);
    await l2.release(); // should not throw or release l1
  });

  test("different keys are independent", async () => {
    const { lock } = setup();
    const l1 = await lock.acquire("a");
    const l2 = await lock.acquire("b");
    expect(l1.acquired).toBe(true);
    expect(l2.acquired).toBe(true);
  });
});

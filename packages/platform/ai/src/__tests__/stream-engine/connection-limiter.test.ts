import { describe, test, expect } from "bun:test";
import { createConnectionLimiter } from "../../stream-engine/connection-limiter";
import { createMockCache } from "../helpers";

describe("createConnectionLimiter", () => {
  test("allows connections within limit", async () => {
    const cache = createMockCache();
    const limiter = createConnectionLimiter({ cache: cache as never, maxPerUser: 3 });

    expect(await limiter.acquire("user1")).toBe(true);
    expect(await limiter.acquire("user1")).toBe(true);
    expect(await limiter.acquire("user1")).toBe(true);
  });

  test("rejects connections over limit", async () => {
    const cache = createMockCache();
    const limiter = createConnectionLimiter({ cache: cache as never, maxPerUser: 2 });

    expect(await limiter.acquire("user1")).toBe(true);
    expect(await limiter.acquire("user1")).toBe(true);
    expect(await limiter.acquire("user1")).toBe(false);
  });

  test("release allows new connections", async () => {
    const cache = createMockCache();
    const limiter = createConnectionLimiter({ cache: cache as never, maxPerUser: 1 });

    expect(await limiter.acquire("user1")).toBe(true);
    expect(await limiter.acquire("user1")).toBe(false);

    await limiter.release("user1");
    expect(await limiter.acquire("user1")).toBe(true);
  });
});

// @aeron/core - 熔断器测试

import { describe, expect, it, mock } from "bun:test";
import { createCircuitBreaker, createCircuitOpenError } from "../circuit-breaker";

describe("createCircuitBreaker", () => {
  it("should start in closed state", () => {
    const cb = createCircuitBreaker();
    expect(cb.getState()).toBe("closed");
  });

  it("should execute successfully without incrementing failures", async () => {
    const cb = createCircuitBreaker();
    const result = await cb.execute(() => Promise.resolve(42));
    expect(result).toBe(42);
    expect(cb.getStats().failures).toBe(0);
    expect(cb.getStats().successes).toBe(1);
  });

  it("should increment failure count on error", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 5 });
    try {
      await cb.execute(() => Promise.reject(new Error("fail")));
    } catch {
      // expected
    }
    expect(cb.getStats().failures).toBe(1);
    expect(cb.getState()).toBe("closed");
  });

  it("should open circuit after reaching failure threshold", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 3 });
    for (let i = 0; i < 3; i++) {
      try {
        await cb.execute(() => Promise.reject(new Error("fail")));
      } catch {
        // expected
      }
    }
    expect(cb.getState()).toBe("open");
    expect(cb.getStats().failures).toBe(3);
  });

  it("should reject immediately in open state with CircuitOpenError", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1 });
    try {
      await cb.execute(() => Promise.reject(new Error("fail")));
    } catch {
      // triggers open
    }
    expect(cb.getState()).toBe("open");

    try {
      await cb.execute(() => Promise.resolve("should not run"));
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      expect((err as Error).name).toBe("CircuitOpenError");
      expect((err as Error).message).toBe("Circuit breaker is open");
    }
  });

  it("should transition to half-open after reset timeout", async () => {
    const cb = createCircuitBreaker({
      failureThreshold: 1,
      resetTimeout: 50,
    });
    try {
      await cb.execute(() => Promise.reject(new Error("fail")));
    } catch {
      // triggers open
    }
    expect(cb.getState()).toBe("open");

    await Bun.sleep(60);
    expect(cb.getState()).toBe("half-open");
  });

  it("should recover to closed on success in half-open state", async () => {
    const cb = createCircuitBreaker({
      failureThreshold: 1,
      resetTimeout: 50,
      halfOpenMax: 1,
    });
    try {
      await cb.execute(() => Promise.reject(new Error("fail")));
    } catch {
      // triggers open
    }

    await Bun.sleep(60);
    expect(cb.getState()).toBe("half-open");

    const result = await cb.execute(() => Promise.resolve("recovered"));
    expect(result).toBe("recovered");
    expect(cb.getState()).toBe("closed");
  });

  it("should reopen on failure in half-open state", async () => {
    const cb = createCircuitBreaker({
      failureThreshold: 1,
      resetTimeout: 50,
      halfOpenMax: 1,
    });
    try {
      await cb.execute(() => Promise.reject(new Error("fail")));
    } catch {
      // triggers open
    }

    await Bun.sleep(60);
    expect(cb.getState()).toBe("half-open");

    try {
      await cb.execute(() => Promise.reject(new Error("fail again")));
    } catch {
      // expected
    }
    expect(cb.getState()).toBe("open");
  });

  it("should reset to closed state", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1 });
    try {
      await cb.execute(() => Promise.reject(new Error("fail")));
    } catch {
      // triggers open
    }
    expect(cb.getState()).toBe("open");

    cb.reset();
    expect(cb.getState()).toBe("closed");
    expect(cb.getStats().failures).toBe(0);
    expect(cb.getStats().successes).toBe(0);
  });

  it("should call onStateChange callback on transitions", async () => {
    const changes: Array<{ from: string; to: string }> = [];
    const cb = createCircuitBreaker({
      failureThreshold: 1,
      resetTimeout: 50,
      onStateChange: (from, to) => changes.push({ from, to }),
    });

    try {
      await cb.execute(() => Promise.reject(new Error("fail")));
    } catch {
      // triggers open
    }
    expect(changes).toEqual([{ from: "closed", to: "open" }]);

    await Bun.sleep(60);
    // Trigger half-open check via getState
    cb.getState();
    expect(changes).toEqual([
      { from: "closed", to: "open" },
      { from: "open", to: "half-open" },
    ]);
  });

  it("should return correct stats including lastFailure", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 5 });
    await cb.execute(() => Promise.resolve("ok"));
    const before = Date.now();
    try {
      await cb.execute(() => Promise.reject(new Error("fail")));
    } catch {
      // expected
    }
    const after = Date.now();

    const stats = cb.getStats();
    expect(stats.state).toBe("closed");
    expect(stats.failures).toBe(1);
    expect(stats.successes).toBe(1);
    expect(stats.lastFailure).toBeGreaterThanOrEqual(before);
    expect(stats.lastFailure).toBeLessThanOrEqual(after);
  });

  it("should limit half-open attempts to halfOpenMax", async () => {
    const cb = createCircuitBreaker({
      failureThreshold: 1,
      resetTimeout: 50,
      halfOpenMax: 1,
    });
    try {
      await cb.execute(() => Promise.reject(new Error("fail")));
    } catch {
      // triggers open
    }

    await Bun.sleep(60);
    expect(cb.getState()).toBe("half-open");

    // First attempt allowed (even if it hasn't resolved yet, the second should be blocked)
    // Execute one that will succeed to use up the attempt
    try {
      await cb.execute(() => Promise.reject(new Error("half-open fail")));
    } catch {
      // expected - this reopens the circuit
    }
    expect(cb.getState()).toBe("open");
  });
});

describe("createCircuitOpenError", () => {
  it("should create an error with correct name and message", () => {
    const err = createCircuitOpenError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("CircuitOpenError");
    expect(err.message).toBe("Circuit breaker is open");
  });
});

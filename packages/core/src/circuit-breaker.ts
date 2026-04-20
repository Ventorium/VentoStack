// @aeron/core - 熔断器

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeout?: number;
  halfOpenMax?: number;
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

export interface CircuitBreaker {
  execute<T>(fn: () => Promise<T>): Promise<T>;
  getState(): CircuitState;
  getStats(): {
    state: CircuitState;
    failures: number;
    successes: number;
    lastFailure?: number;
  };
  reset(): void;
}

export function createCircuitOpenError(): Error {
  const error = new Error("Circuit breaker is open");
  error.name = "CircuitOpenError";
  return error;
}

export function createCircuitBreaker(
  options?: CircuitBreakerOptions,
): CircuitBreaker {
  const failureThreshold = options?.failureThreshold ?? 5;
  const resetTimeout = options?.resetTimeout ?? 30_000;
  const halfOpenMax = options?.halfOpenMax ?? 1;
  const onStateChange = options?.onStateChange;

  let state: CircuitState = "closed";
  let failures = 0;
  let successes = 0;
  let lastFailure: number | undefined;
  let halfOpenAttempts = 0;
  let openedAt: number | undefined;

  function transition(to: CircuitState): void {
    if (state === to) return;
    const from = state;
    state = to;
    if (to === "closed") {
      failures = 0;
      halfOpenAttempts = 0;
      openedAt = undefined;
    }
    if (to === "open") {
      openedAt = Date.now();
      halfOpenAttempts = 0;
    }
    if (to === "half-open") {
      halfOpenAttempts = 0;
    }
    onStateChange?.(from, to);
  }

  function checkOpenTimeout(): void {
    if (state === "open" && openedAt !== undefined) {
      if (Date.now() - openedAt >= resetTimeout) {
        transition("half-open");
      }
    }
  }

  return {
    async execute<T>(fn: () => Promise<T>): Promise<T> {
      checkOpenTimeout();

      if (state === "open") {
        throw createCircuitOpenError();
      }

      if (state === "half-open" && halfOpenAttempts >= halfOpenMax) {
        throw createCircuitOpenError();
      }

      if (state === "half-open") {
        halfOpenAttempts++;
      }

      try {
        const result = await fn();
        successes++;
        if (state === "half-open") {
          transition("closed");
        }
        return result;
      } catch (error) {
        failures++;
        lastFailure = Date.now();

        if (state === "half-open") {
          transition("open");
        } else if (state === "closed" && failures >= failureThreshold) {
          transition("open");
        }

        throw error;
      }
    },

    getState(): CircuitState {
      checkOpenTimeout();
      return state;
    },

    getStats() {
      checkOpenTimeout();
      return {
        state,
        failures,
        successes,
        lastFailure,
      };
    },

    reset(): void {
      transition("closed");
      successes = 0;
      lastFailure = undefined;
    },
  };
}

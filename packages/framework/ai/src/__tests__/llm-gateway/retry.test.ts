import { describe, test, expect, mock } from "bun:test";
import { withRetry } from "../../llm-gateway/retry";

function makeRetryableError(message: string, status = 500): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

describe("withRetry", () => {
  test("succeeds on first try", async () => {
    const fn = mock(() => Promise.resolve("ok"));
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("retries on retryable error and eventually succeeds", async () => {
    let attempts = 0;
    const fn = mock(() => {
      attempts++;
      if (attempts < 3) return Promise.reject(makeRetryableError("fail", 500));
      return Promise.resolve("ok");
    });

    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 50 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("throws after max retries exhausted", async () => {
    const fn = mock(() => Promise.reject(makeRetryableError("persistent failure", 502)));

    await expect(
      withRetry(fn, { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 50 }),
    ).rejects.toThrow("persistent failure");
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  test("retries on 429 status", async () => {
    let attempts = 0;
    const fn = mock(() => {
      attempts++;
      if (attempts < 2) return Promise.reject(makeRetryableError("rate limited", 429));
      return Promise.resolve("ok");
    });

    const result = await withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 10,
      retryableStatusCodes: [429, 500, 502, 503, 504],
    });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("does not retry non-retryable errors", async () => {
    const fn = mock(() => Promise.reject(new Error("bad request")));

    await expect(
      withRetry(fn, { maxRetries: 3, baseDelayMs: 10 }),
    ).rejects.toThrow("bad request");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

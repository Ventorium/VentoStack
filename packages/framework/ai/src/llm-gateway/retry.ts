/**
 * 重试策略：指数退避 + jitter + 429 Retry-After 支持
 */

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
  retryableStatusCodes: number[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.1,
  retryableStatusCodes: [429, 500, 502, 503, 504],
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs, jitterFactor, retryableStatusCodes } = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      const rawCode = (err as { code?: unknown })?.code;
      const statusCode =
        (err as { status?: number })?.status ??
        (err as { statusCode?: number })?.statusCode ??
        (typeof rawCode === "number" ? rawCode : undefined);
      const isRetryable =
        retryableStatusCodes.includes(statusCode ?? 0) ||
        (err as { code?: string })?.code === "ETIMEDOUT" ||
        (err as { code?: string })?.code === "ECONNRESET";

      if (!isRetryable || attempt === maxRetries) {
        throw lastError;
      }

      // 指数退避 + jitter
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      const jitter = delay * jitterFactor * (Math.random() * 2 - 1);
      const finalDelay = Math.max(0, delay + jitter);

      // 429 特殊处理：使用 Retry-After header
      if (statusCode === 429) {
        const retryAfter = (err as { headers?: Record<string, string> })
          ?.headers?.["retry-after"];
        if (retryAfter) {
          const retryAfterMs = parseInt(retryAfter, 10) * 1000;
          if (!isNaN(retryAfterMs)) {
            await sleep(Math.max(retryAfterMs, finalDelay));
            continue;
          }
        }
      }

      await sleep(finalDelay);
    }
  }

  throw lastError!;
}

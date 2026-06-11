/**
 * 并发队列：限制同时发往 LLM 的请求数
 */
import { aiErrors } from "../errors";

export interface QueueConfig {
  maxConcurrent: number;
  maxQueued: number;
  queueTimeoutMs: number;
}

const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxConcurrent: 10,
  maxQueued: 100,
  queueTimeoutMs: 30000,
};

export interface RequestQueue {
  acquire(): Promise<void>;
  release(): void;
}

export function createRequestQueue(
  config: Partial<QueueConfig> = {},
): RequestQueue {
  const { maxConcurrent, maxQueued, queueTimeoutMs } = {
    ...DEFAULT_QUEUE_CONFIG,
    ...config,
  };

  let active = 0;
  const queue: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  return {
    async acquire(): Promise<void> {
      if (active < maxConcurrent) {
        active++;
        return;
      }

      if (queue.length >= maxQueued) {
        throw aiErrors.queueFull();
      }

      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          const idx = queue.findIndex((item) => item.resolve === resolve);
          if (idx !== -1) queue.splice(idx, 1);
          reject(aiErrors.queueTimeout());
        }, queueTimeoutMs);

        queue.push({ resolve, reject, timer });
      });
    },

    release(): void {
      active--;
      if (queue.length > 0) {
        const next = queue.shift()!;
        clearTimeout(next.timer);
        active++;
        next.resolve();
      }
    },
  };
}

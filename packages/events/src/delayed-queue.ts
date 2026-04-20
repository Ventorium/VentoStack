/**
 * In-memory delayed queue — schedule messages for future execution.
 */

export interface DelayedMessage<T = unknown> {
  id: string;
  payload: T;
  executeAt: number;
  topic: string;
}

export interface DelayedQueue {
  schedule<T>(topic: string, payload: T, delayMs: number): string;
  cancel(id: string): boolean;
  pending(): number;
  start(pollInterval?: number): void;
  stop(): void;
}

export function createDelayedQueue(
  handler: (message: DelayedMessage) => Promise<void>,
): DelayedQueue {
  const messages: DelayedMessage[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;

  function insertSorted(message: DelayedMessage): void {
    // Binary-search insert to keep sorted by executeAt ascending
    let lo = 0;
    let hi = messages.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (messages[mid]!.executeAt <= message.executeAt) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    messages.splice(lo, 0, message);
  }

  function schedule<T>(topic: string, payload: T, delayMs: number): string {
    const id = crypto.randomUUID();
    const message: DelayedMessage<T> = {
      id,
      payload,
      executeAt: Date.now() + delayMs,
      topic,
    };
    insertSorted(message as DelayedMessage);
    return id;
  }

  function cancel(id: string): boolean {
    const idx = messages.findIndex((m) => m.id === id);
    if (idx === -1) return false;
    messages.splice(idx, 1);
    return true;
  }

  function pending(): number {
    return messages.length;
  }

  async function poll(): Promise<void> {
    const now = Date.now();
    // Process all due messages (they are sorted, so we can stop early)
    while (messages.length > 0 && messages[0]!.executeAt <= now) {
      const message = messages.shift()!;
      try {
        await handler(message);
      } catch {
        // Swallow — handler errors must not crash the poll loop.
      }
    }
  }

  function start(pollInterval = 1000): void {
    if (timer !== null) return;
    timer = setInterval(() => {
      void poll();
    }, pollInterval);
  }

  function stop(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { schedule, cancel, pending, start, stop };
}

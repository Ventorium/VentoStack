// @aeron/events - 事件队列化处理

export interface QueuedEvent<T = unknown> {
  id: string;
  name: string;
  payload: T;
  priority: number;
  enqueuedAt: number;
  processedAt?: number;
}

export interface EventQueueOptions {
  /** 最大队列长度 */
  maxSize?: number;
  /** 并发消费者数 */
  concurrency?: number;
  /** 处理超时（ms） */
  timeout?: number;
}

export interface EventQueue {
  enqueue<T>(name: string, payload: T, priority?: number): string;
  process(handler: (event: QueuedEvent) => Promise<void>): Promise<void>;
  size(): number;
  pending(): QueuedEvent[];
  drain(): Promise<void>;
  clear(): void;
  pause(): void;
  resume(): void;
  isPaused(): boolean;
}

/**
 * 创建事件队列（优先级排序 + 批量消费）
 */
export function createEventQueue(options?: EventQueueOptions): EventQueue {
  const maxSize = options?.maxSize ?? 10000;
  const concurrency = options?.concurrency ?? 1;
  const timeout = options?.timeout ?? 30000;
  const queue: QueuedEvent[] = [];
  let paused = false;
  let processing = false;

  function sortByPriority(): void {
    queue.sort((a, b) => b.priority - a.priority);
  }

  return {
    enqueue<T>(name: string, payload: T, priority = 0): string {
      if (queue.length >= maxSize) {
        throw new Error(`Event queue full (max: ${maxSize})`);
      }
      const id = crypto.randomUUID();
      queue.push({
        id,
        name,
        payload,
        priority,
        enqueuedAt: Date.now(),
      });
      sortByPriority();
      return id;
    },

    async process(handler: (event: QueuedEvent) => Promise<void>): Promise<void> {
      if (paused || processing) return;
      processing = true;

      try {
        const batch = queue.splice(0, concurrency);
        const promises = batch.map(async (event) => {
          try {
            await Promise.race([
              handler(event),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("Event processing timeout")), timeout),
              ),
            ]);
            event.processedAt = Date.now();
          } catch (err) {
            // 处理失败，放回队列尾部（降低优先级）
            event.priority = Math.max(event.priority - 1, -100);
            queue.push(event);
          }
        });
        await Promise.all(promises);
      } finally {
        processing = false;
      }
    },

    size(): number {
      return queue.length;
    },

    pending(): QueuedEvent[] {
      return [...queue];
    },

    async drain(): Promise<void> {
      // 清空队列但不处理
      queue.length = 0;
    },

    clear(): void {
      queue.length = 0;
    },

    pause(): void {
      paused = true;
    },

    resume(): void {
      paused = false;
    },

    isPaused(): boolean {
      return paused;
    },
  };
}

/**
 * In-memory message queue with retry and concurrency support.
 */

export interface Message<T = unknown> {
  id: string;
  topic: string;
  payload: T;
  headers?: Record<string, string>;
  timestamp: number;
  retryCount?: number;
}

export interface MessageHandler<T = unknown> {
  (message: Message<T>): Promise<void>;
}

export interface QueueOptions {
  /** Maximum retry attempts on handler failure. Default: 3 */
  maxRetries?: number;
  /** Delay between retries in milliseconds. Default: 1000 */
  retryDelay?: number;
  /** Maximum concurrent message processing. Default: 1 */
  concurrency?: number;
}

export interface MessageQueue {
  publish<T>(topic: string, payload: T, headers?: Record<string, string>): Promise<string>;
  subscribe<T>(topic: string, handler: MessageHandler<T>, options?: QueueOptions): () => void;
  unsubscribe(topic: string): void;
  pending(topic: string): number;
}

interface TopicState<T = unknown> {
  messages: Message<T>[];
  handlers: Array<{ handler: MessageHandler<T>; options: Required<QueueOptions> }>;
  activeCount: number;
  processing: boolean;
}

export function createMemoryQueue(): MessageQueue {
  const topics = new Map<string, TopicState>();

  function getTopicState(topic: string): TopicState {
    let state = topics.get(topic);
    if (!state) {
      state = { messages: [], handlers: [], activeCount: 0, processing: false };
      topics.set(topic, state);
    }
    return state;
  }

  async function processNext(topic: string): Promise<void> {
    const state = getTopicState(topic);

    if (state.handlers.length === 0 || state.messages.length === 0) {
      state.processing = false;
      return;
    }

    // Find max concurrency across handlers
    const maxConcurrency = Math.max(...state.handlers.map((h) => h.options.concurrency));

    if (state.activeCount >= maxConcurrency) {
      return;
    }

    const message = state.messages.shift();
    if (!message) {
      state.processing = false;
      return;
    }

    state.activeCount++;

    // Run all handlers for this message
    const handlerPromises = state.handlers.map(async ({ handler, options }) => {
      await executeWithRetry(handler, message, options.maxRetries, options.retryDelay);
    });

    try {
      await Promise.all(handlerPromises);
    } finally {
      state.activeCount--;
      // Continue processing remaining messages
      if (state.messages.length > 0 && state.handlers.length > 0) {
        void processNext(topic);
      } else {
        state.processing = false;
      }
    }
  }

  async function executeWithRetry<T>(
    handler: MessageHandler<T>,
    message: Message<T>,
    maxRetries: number,
    retryDelay: number,
  ): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const msg = attempt > 0 ? { ...message, retryCount: attempt } : message;
        await handler(msg);
        return;
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries) {
          await new Promise<void>((resolve) => setTimeout(resolve, retryDelay));
        }
      }
    }
    throw lastError;
  }

  function startProcessing(topic: string): void {
    const state = getTopicState(topic);
    if (!state.processing && state.messages.length > 0 && state.handlers.length > 0) {
      state.processing = true;
      void processNext(topic);
    }
  }

  async function publish<T>(topic: string, payload: T, headers?: Record<string, string>): Promise<string> {
    const id = crypto.randomUUID();
    const message: Message<T> = {
      id,
      topic,
      payload,
      timestamp: Date.now(),
      ...(headers ? { headers } : {}),
    };

    const state = getTopicState(topic) as TopicState<T>;
    state.messages.push(message);

    startProcessing(topic);

    return id;
  }

  function subscribe<T>(topic: string, handler: MessageHandler<T>, options?: QueueOptions): () => void {
    const state = getTopicState(topic) as TopicState<T>;
    const resolvedOptions: Required<QueueOptions> = {
      maxRetries: options?.maxRetries ?? 3,
      retryDelay: options?.retryDelay ?? 1000,
      concurrency: options?.concurrency ?? 1,
    };

    const entry = { handler, options: resolvedOptions };
    state.handlers.push(entry);

    // Start processing any pending messages
    startProcessing(topic);

    return () => {
      const idx = state.handlers.indexOf(entry);
      if (idx !== -1) {
        state.handlers.splice(idx, 1);
      }
    };
  }

  function unsubscribe(topic: string): void {
    const state = topics.get(topic);
    if (state) {
      state.handlers = [];
    }
  }

  function pending(topic: string): number {
    return topics.get(topic)?.messages.length ?? 0;
  }

  return { publish, subscribe, unsubscribe, pending };
}

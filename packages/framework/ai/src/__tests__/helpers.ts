/**
 * 测试辅助函数
 * 复用现有 createMockDatabase 模式
 */

// Mock Executor
export function createMockExec(responses?: Record<string, unknown[]>) {
  const calls: unknown[][] = [];

  function exec(...args: unknown[]): Promise<unknown[]> {
    calls.push(args);
    const sql = String(args[0] ?? "");

    if (responses) {
      for (const [pattern, result] of Object.entries(responses)) {
        if (sql.includes(pattern)) return Promise.resolve(result);
      }
    }
    return Promise.resolve([]);
  }

  return Object.assign(exec, { calls });
}

// Mock Database
export function createMockDatabase(responses?: Record<string, unknown[]>) {
  const exec = createMockExec(responses);
  const db = {
    raw: (...args: unknown[]) => exec(...args),
    query: () => ({}) as never,
  };
  return { db: db as never, exec };
}

// Mock LLM Provider
export function createMockLLMProvider(responses: Array<{ content: string; toolCalls?: unknown[] }>) {
  let callIndex = 0;

  return {
    name: "mock-llm",
    capabilities: {
      functionCalling: true,
      maxContextLength: 128000,
      supportsVision: false,
      supportsStreaming: true,
    },
    async chat() {
      const response = responses[callIndex] ?? responses[responses.length - 1];
      callIndex++;
      return {
        content: response?.content ?? "",
        toolCalls: response?.toolCalls,
        usage: { promptTokens: 10, completionTokens: 20 },
        finishReason: "stop" as const,
      };
    },
    async *chatStream() {
      const response = responses[callIndex] ?? responses[responses.length - 1];
      callIndex++;
      yield { type: "content" as const, delta: response?.content ?? "" };
      yield { type: "done" as const };
    },
    async listModels() {
      return [];
    },
  };
}

// Mock Cache (in-memory)
export function createMockCache() {
  const store = new Map<string, unknown>();

  return {
    async get<T>(key: string): Promise<T | null> {
      return (store.get(key) as T) ?? null;
    },
    async set(key: string, value: unknown, options?: { ttl?: number }): Promise<void> {
      store.set(key, value);
    },
    async del(key: string): Promise<void> {
      store.delete(key);
    },
    async has(key: string): Promise<boolean> {
      return store.has(key);
    },
    async flush(): Promise<void> {
      store.clear();
    },
    withTags: () => createMockCache(),
    store,
  };
}

// Mock EventBus
export function createMockEventBus() {
  const events: Array<{ event: string; data: unknown }> = [];
  return {
    async emit(event: string, data: unknown) {
      events.push({ event, data });
    },
    on: () => {},
    off: () => {},
    events,
  };
}

// Mock SSE Stream
export async function* createMockStream(chunks: Array<{ type: string; delta?: string }>) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

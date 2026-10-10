/**
 * @ventostack/ai-context — 测试辅助工具
 *
 * Mock SQL executor + Database。
 * 匹配顺序：精确子串 → 表名模糊匹配 → 归一化空白后匹配。
 */

import { mock } from "bun:test";

export interface RecordedCall {
  text: string;
  params?: unknown[];
}

export function createMockExecutor() {
  const calls: RecordedCall[] = [];
  const results = new Map<string, unknown[]>();

  const executor = mock(async (text: string, params?: unknown[]): Promise<unknown[]> => {
    calls.push({ text, params });

    // 1. 精确子串
    for (const [pattern, result] of results) {
      if (text.includes(pattern)) return result;
    }

    // 2. 归一化空白后匹配（SQL 常带换行缩进）
    const flat = text.replace(/\s+/g, " ").trim();
    for (const [pattern, result] of results) {
      if (flat.includes(pattern.replace(/\s+/g, " ").trim())) return result;
    }

    return [];
  });

  return { executor, calls, results };
}

export function createMockDatabase(mockExecutor: ReturnType<typeof createMockExecutor>) {
  const { executor } = mockExecutor;
  const db = {
    raw: mock(async (text: string, params?: unknown[]) => executor(text, params)),
    async transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      return fn(db);
    },
    async close() {},
  };
  return { db: db as never, registerModel: (_model: unknown, _table?: string) => {} };
}
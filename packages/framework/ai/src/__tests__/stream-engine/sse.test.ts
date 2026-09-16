import { describe, expect, test } from 'bun:test';
import type { StreamChunk } from '../../llm-gateway/types';
import { createSSEResponse } from '../../stream-engine/sse';

describe('createSSEResponse 断开语义', () => {
  test('正常下发 SSE 数据块', async () => {
    async function* stream(): AsyncGenerator<StreamChunk> {
      yield { type: 'content', delta: 'hello' };
    }
    const response = createSSEResponse(stream(), { heartbeatIntervalMs: 10_000 });
    const text = await response.text();
    expect(text).toContain('data: {"type":"content","delta":"hello"}');
  });

  test('客户端断开后仍把 generator 排空到底（审批/落盘副作用不能被打断）', async () => {
    let completed = false;
    const controller = new AbortController();
    async function* stream(): AsyncGenerator<StreamChunk> {
      yield { type: 'content', delta: 'first' };
      // 断开后仍应被继续拉取：模拟审批等待 / 工具执行
      await new Promise((resolve) => setTimeout(resolve, 20));
      yield { type: 'content', delta: 'second' };
      completed = true;
    }

    const response = createSSEResponse(stream(), {
      signal: controller.signal,
      heartbeatIntervalMs: 10_000,
    });
    const reader = response.body!.getReader();
    await reader.read();
    // 模拟刷新页面：HTTP 请求 signal abort
    controller.abort();
    await reader.cancel().catch(() => {});

    for (let i = 0; i < 50 && !completed; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(completed).toBe(true);
  });
});

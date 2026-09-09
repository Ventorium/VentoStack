import { describe, expect, test } from 'bun:test';
import { createMemoryConsolidator } from '../../memory/consolidator';
import type { LLMGateway } from '../../llm-gateway/types';
import type { MemoryService, SessionMemoryState } from '../../memory/types';

describe('Memory Agent consolidator', () => {
  test('only submits events that have not been processed', async () => {
    const applied: string[][] = [];
    const statuses: Array<{ status: string; processed?: string[] }> = [];
    const state: SessionMemoryState = {
      content: '# 会话记忆',
      events: [
        { id: 'old-event', type: 'concern', content: '旧事件', sourceMessageIds: [], createdAt: new Date().toISOString() },
        { id: 'new-event', type: 'correction', content: '新事件', sourceMessageIds: [], createdAt: new Date().toISOString() },
      ],
      status: 'pending',
      processedEventIds: ['old-event'],
    };
    const memory = {
      withSessionMemoryLock: async (_id: string, _scope: unknown, task: () => Promise<unknown>) => ({ acquired: true, result: await task() }),
      getSessionMemory: async () => state,
      applyMemoryOperations: async (_id: string, _scope: unknown, operations: Array<{ sourceEventIds: string[] }>) => applied.push(operations.flatMap((operation) => operation.sourceEventIds)),
      setMemoryConsolidationStatus: async (_id: string, _scope: unknown, status: string, _error?: string, processed?: string[]) => { statuses.push({ status, processed }); },
    } as unknown as MemoryService;
    const gateway = {
      chat: async (params: { messages: Array<{ content: string }> }) => {
        expect(params.messages[1]?.content).toContain('new-event');
        expect(params.messages[1]?.content).not.toContain('old-event');
        return { content: '[{"op":"ADD","id":"preference","content":"新事件","confidence":0.9,"sourceEventIds":["new-event"]}]' };
      },
    } as unknown as LLMGateway;

    await createMemoryConsolidator({ memory, llmGateway: gateway })({
      sessionId: 'session-a', scope: { tenantId: 'tenant-a', userId: 'user-a' }, model: 'model-a',
    });

    expect(applied).toEqual([['new-event']]);
    expect(statuses.at(-1)).toEqual({ status: 'completed', processed: ['old-event', 'new-event'] });
  });

  test('records a failed status for invalid model output', async () => {
    const statuses: string[] = [];
    const memory = {
      withSessionMemoryLock: async (_id: string, _scope: unknown, task: () => Promise<unknown>) => ({ acquired: true, result: await task() }),
      getSessionMemory: async () => ({ content: '', events: [{ id: 'event-a', type: 'concern', content: 'x', sourceMessageIds: [], createdAt: '' }], status: 'pending', processedEventIds: [] }),
      setMemoryConsolidationStatus: async (_id: string, _scope: unknown, status: string) => { statuses.push(status); },
    } as unknown as MemoryService;
    const gateway = { chat: async () => ({ content: 'not json' }) } as unknown as LLMGateway;

    await createMemoryConsolidator({ memory, llmGateway: gateway })({
      sessionId: 'session-a', scope: { tenantId: 'tenant-a', userId: 'user-a' }, model: 'model-a',
    });

    expect(statuses).toEqual(['processing', 'failed']);
  });
});

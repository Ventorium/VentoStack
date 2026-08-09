import { describe, expect, test } from 'bun:test';
import { createAgentLoop, parseSubtasks, type AgentConfig } from '../../agent-engine/agent-loop';
import type { AgentTool } from '../../agent-engine/types';
import type {
  ChatParams,
  ChatResult,
  LLMGateway,
  LLMProvider,
  StreamChunk,
} from '../../llm-gateway/types';
import type { MemoryService } from '../../memory/types';

function createGateway(turns: StreamChunk[][], requests?: ChatParams[]): LLMGateway {
  let index = 0;
  const provider: LLMProvider = {
    name: 'test',
    capabilities: {
      functionCalling: true,
      maxContextLength: 128_000,
      supportsVision: false,
      supportsStreaming: true,
    },
    async chat(_params: ChatParams): Promise<ChatResult> {
      throw new Error('not used');
    },
    async *chatStream(_params: ChatParams): AsyncIterable<StreamChunk> {
      requests?.push(_params);
      for (const chunk of turns[index++] ?? [{ type: 'done' as const }]) yield chunk;
    },
    async listModels() {
      return [];
    },
  };
  return {
    chat: provider.chat,
    chatStream: provider.chatStream,
    getProvider: () => provider,
    getDefaultProvider: () => provider,
    listProviders: () => [provider],
  };
}

function createLookupTool(): AgentTool {
  return {
    name: 'lookup',
    description: 'Look something up',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
    execute: async () => ({ content: [{ type: 'text', text: 'result' }], details: {} }),
  };
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

function createMemoryMock(overrides?: Partial<MemoryService>): MemoryService {
  const getHistory = async () => [
    { role: 'user' as const, content: '之前的问题' },
    { role: 'assistant' as const, content: '之前的回答' },
  ];
  return {
    createSession: async () => ({ sessionId: 's' }),
    appendMessage: async () => {},
    getSession: async () => null,
    listSessions: async () => [],
    deleteSession: async () => {},
    forkSession: async () => ({ sessionId: 's' }),
    getHistory,
    createLongTermMemory: async () => {},
    updateLongTermMemory: async () => {},
    readLongTermMemory: async () => null,
    listLongTermMemories: async () => [],
    deleteLongTermMemory: async () => {},
    ...overrides,
  } as MemoryService;
}

const baseAgent: AgentConfig = {
  id: 'agent',
  name: 'test',
  systemPrompt: '你是助手',
  model: 'default',
  tenantId: 'tenant',
};

describe('agent loop audit + memory config', () => {
  test('auditToolCall records successful and failed tool executions', async () => {
    const audits: Array<Record<string, unknown>> = [];
    const gateway = createGateway([
      [
        {
          type: 'tool_call_start',
          toolCall: { id: 'c1', name: 'lookup', arguments: { query: 'x' } },
        },
        { type: 'tool_call_start', toolCall: { id: 'c2', name: 'missing', arguments: {} } },
        { type: 'done' },
      ],
      [{ type: 'content', delta: 'ok' }, { type: 'done' }],
    ]);
    const loop = createAgentLoop({
      llmGateway: gateway,
      agentTools: [createLookupTool()],
      auditToolCall: async (log) => audits.push({ ...log }),
    });

    await collect(
      loop.runStream({
        agentId: 'agent',
        userId: 'user',
        tenantId: 'tenant',
        sessionId: 'conv-1',
        message: 'run',
      }),
    );

    // c1 成功、c2 工具不存在（immediate error）
    const byCallId = new Map(audits.map((a) => [a.toolCallId, a]));
    expect(byCallId.get('c1')).toMatchObject({
      toolName: 'lookup',
      status: 'success',
      userId: 'user',
      tenantId: 'tenant',
      sessionId: 'conv-1',
      input: { query: 'x' },
    });
    expect(byCallId.get('c2')).toMatchObject({ toolName: 'missing', status: 'error' });
    expect(typeof (byCallId.get('c1') as { duration: number }).duration).toBe('number');
  });

  test('auditToolCall failure does not break the run', async () => {
    const gateway = createGateway([
      [
        {
          type: 'tool_call_start',
          toolCall: { id: 'c1', name: 'lookup', arguments: { query: 'x' } },
        },
        { type: 'done' },
      ],
      [{ type: 'content', delta: 'ok' }, { type: 'done' }],
    ]);
    const loop = createAgentLoop({
      llmGateway: gateway,
      agentTools: [createLookupTool()],
      auditToolCall: async () => {
        throw new Error('db down');
      },
    });

    const chunks = await collect(
      loop.runStream({
        agentId: 'agent',
        userId: 'user',
        tenantId: 'tenant',
        message: 'run',
      }),
    );
    expect(chunks.some((c) => c.type === 'content' && c.delta === 'ok')).toBe(true);
  });

  test('history is loaded when memory enabled (default)', async () => {
    const requests: ChatParams[] = [];
    let historyCalls = 0;
    const gateway = createGateway([[{ type: 'content', delta: 'ok' }, { type: 'done' }]], requests);
    const loop = createAgentLoop({
      llmGateway: gateway,
      agentService: {
        getById: async () => ({ ...baseAgent }),
      },
      memory: createMemoryMock({
        getHistory: async (sessionId, scope, limit) => {
          historyCalls += 1;
          expect(sessionId).toBe('conv-1');
          expect(scope).toEqual({ tenantId: 'tenant', userId: 'user' });
          expect(limit).toBe(20);
          return [
            { role: 'user', content: '历史问题' },
            { role: 'assistant', content: '历史回答' },
          ];
        },
      }),
    });

    await collect(
      loop.runStream({
        agentId: 'agent',
        userId: 'user',
        tenantId: 'tenant',
        sessionId: 'conv-1',
        message: 'run',
      }),
    );

    expect(historyCalls).toBe(1);
    const systemCount = requests[0]?.messages.filter((m) => m.role === 'system').length ?? 0;
    expect(systemCount).toBeGreaterThanOrEqual(1);
    const historyRoles = requests[0]?.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => m.content);
    expect(historyRoles).toEqual(['历史问题', '历史回答', 'run']);
  });

  test('memory_config.enabled=false skips history load and save', async () => {
    const requests: ChatParams[] = [];
    let historyCalls = 0;
    let saveCalls = 0;
    const gateway = createGateway([[{ type: 'content', delta: 'ok' }, { type: 'done' }]], requests);
    const loop = createAgentLoop({
      llmGateway: gateway,
      agentService: {
        getById: async () => ({ ...baseAgent, memoryConfig: { enabled: false } }),
      },
      memory: createMemoryMock({
        getHistory: async () => {
          historyCalls += 1;
          return [];
        },
        appendMessage: async () => {
          saveCalls += 1;
        },
      }),
    });

    await collect(
      loop.runStream({
        agentId: 'agent',
        userId: 'user',
        tenantId: 'tenant',
        sessionId: 'conv-1',
        message: 'run',
      }),
    );

    expect(historyCalls).toBe(0);
    expect(saveCalls).toBe(0);
    const historyRoles = requests[0]?.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => m.content);
    expect(historyRoles).toEqual(['run']);
  });

  test('long-term memory is injected when memory_config.longTerm=true', async () => {
    const requests: ChatParams[] = [];
    const gateway = createGateway([[{ type: 'content', delta: 'ok' }, { type: 'done' }]], requests);
    const loop = createAgentLoop({
      llmGateway: gateway,
      agentService: {
        getById: async () => ({ ...baseAgent, memoryConfig: { longTerm: true } }),
      },
      memory: createMemoryMock({
        listLongTermMemories: async (scope) => {
          expect(scope).toEqual({ tenantId: 'tenant', userId: 'user' });
          return [
            {
              tenantId: 'tenant',
              userId: 'user',
              filePath: '/x.md',
              title: '偏好',
              content: '用户喜欢简洁的回答',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ];
        },
      }),
    });

    await collect(
      loop.runStream({
        agentId: 'agent',
        userId: 'user',
        tenantId: 'tenant',
        sessionId: 'conv-1',
        message: 'run',
      }),
    );

    const systemMsg = requests[0]?.messages.find((m) => m.role === 'system')?.content ?? '';
    expect(systemMsg).toContain('偏好');
    expect(systemMsg).toContain('用户喜欢简洁的回答');
  });

  test('long-term memory is NOT injected by default', async () => {
    const requests: ChatParams[] = [];
    let listCalls = 0;
    const gateway = createGateway([[{ type: 'content', delta: 'ok' }, { type: 'done' }]], requests);
    const loop = createAgentLoop({
      llmGateway: gateway,
      agentService: {
        getById: async () => ({ ...baseAgent }),
      },
      memory: createMemoryMock({
        listLongTermMemories: async () => {
          listCalls += 1;
          return [];
        },
      }),
    });

    await collect(
      loop.runStream({
        agentId: 'agent',
        userId: 'user',
        tenantId: 'tenant',
        sessionId: 'conv-1',
        message: 'run',
      }),
    );

    expect(listCalls).toBe(0);
  });
});

describe('agent loop deep research mode', () => {
  test('research.depth=deep injects methodology and raises token budget', async () => {
    const requests: ChatParams[] = [];
    const gateway = createGateway([[{ type: 'content', delta: 'ok' }, { type: 'done' }]], requests);
    const loop = createAgentLoop({
      llmGateway: gateway,
      agentService: {
        getById: async () => ({ ...baseAgent, research: { depth: 'deep' } }),
      },
    });

    await collect(
      loop.runStream({
        agentId: 'agent',
        userId: 'user',
        tenantId: 'tenant',
        message: 'run',
      }),
    );

    expect(requests[0]?.maxTokens).toBe(8192);
    const system = requests[0]?.messages.find((m) => m.role === 'system')?.content ?? '';
    expect(system).toContain('深度研究');
    expect(system).toContain('JSON 数组');
  });

  test('research.depth=quick caps tool iterations at 6', async () => {
    let toolExecutions = 0;
    const executingTool: AgentTool = {
      ...createLookupTool(),
      execute: async () => {
        toolExecutions += 1;
        return { content: [{ type: 'text', text: 'ok' }], details: {} };
      },
    };
    const turns: StreamChunk[][] = [];
    for (let i = 0; i < 8; i++) {
      turns.push([
        { type: 'tool_call_start', toolCall: { id: `c${i}`, name: 'lookup', arguments: { query: 'x' } } },
        { type: 'done' },
      ]);
    }
    turns.push([{ type: 'content', delta: 'done' }, { type: 'done' }]);

    const loop = createAgentLoop({
      llmGateway: createGateway(turns),
      agentTools: [executingTool],
      agentService: {
        getById: async () => ({ ...baseAgent, research: { depth: 'quick' } }),
      },
    });

    await collect(
      loop.runStream({
        agentId: 'agent',
        userId: 'user',
        tenantId: 'tenant',
        message: 'run',
      }),
    );

    // 8 轮工具请求，quick 模式只允许 6 轮
    expect(toolExecutions).toBe(6);
  });

  test('no research config keeps default prompt and token budget', async () => {
    const requests: ChatParams[] = [];
    const gateway = createGateway([[{ type: 'content', delta: 'ok' }, { type: 'done' }]], requests);
    const loop = createAgentLoop({
      llmGateway: gateway,
      agentService: {
        getById: async () => ({ ...baseAgent }),
      },
    });

    await collect(
      loop.runStream({
        agentId: 'agent',
        userId: 'user',
        tenantId: 'tenant',
        message: 'run',
      }),
    );

    expect(requests[0]?.maxTokens).toBeUndefined();
    const system = requests[0]?.messages.find((m) => m.role === 'system')?.content ?? '';
    expect(system).not.toContain('深度研究');
    expect(system).not.toContain('快速探索');
  });

  test('parseSubtasks extracts JSON arrays from planning output', () => {
    expect(parseSubtasks('["问题A", "问题B"]')).toEqual(['问题A', '问题B']);
    expect(parseSubtasks('```json\n["A", "B", "C"]\n```')).toEqual(['A', 'B', 'C']);
    expect(parseSubtasks('计划如下：\n["x", "", "y"]\n请开始。')).toEqual(['x', 'y']);
    expect(parseSubtasks('没有计划')).toEqual([]);
    expect(parseSubtasks('{"plan": "not an array"}')).toEqual([]);
    expect(parseSubtasks('')).toEqual([]);
  });

  test('deep research runs parallel subtasks then synthesizes with sources', async () => {
    const requests: ChatParams[] = [];
    // 主循环规划轮 → 子任务A → 子任务B → 主循环综合轮
    const gateway = createGateway(
      [
        [{ type: 'content', delta: '["问题A","问题B"]' }, { type: 'done' }],
        [{ type: 'content', delta: '结果A\n- https://a.com/source' }, { type: 'done' }],
        [{ type: 'content', delta: '结果B\n- https://b.com/source' }, { type: 'done' }],
        [{ type: 'content', delta: '最终研究报告' }, { type: 'done' }],
      ],
      requests,
    );
    const loop = createAgentLoop({
      llmGateway: gateway,
      agentService: {
        getById: async () => ({ ...baseAgent, research: { depth: 'normal' } }),
      },
    });

    const chunks = await collect(
      loop.runStream({
        agentId: 'agent',
        userId: 'user',
        tenantId: 'tenant',
        message: '研究一下 AI Agent 的发展',
      }),
    );

    // 阶段事件
    const stages = chunks.filter((c) => c.type === 'stage').map((c) => (c as { stage: string }).stage);
    expect(stages).toEqual(['planning', 'researching', 'synthesizing']);

    // 来源清单
    const sourcesChunk = chunks.find((c) => c.type === 'sources') as { sources: Array<{ title: string; url: string }> } | undefined;
    expect(sourcesChunk?.sources.map((s) => s.url)).toEqual(['https://a.com/source', 'https://b.com/source']);

    // 综合轮携带子任务结果
    const finalRequest = requests[requests.length - 1];
    expect(finalRequest?.messages.some((m) => m.role === 'system' && m.content.includes('子问题 1'))).toBe(true);
    expect(finalRequest?.messages.some((m) => m.role === 'system' && m.content.includes('子问题 2'))).toBe(true);

    // 最终内容
    expect(chunks.some((c) => c.type === 'content' && c.delta === '最终研究报告')).toBe(true);
  });

  test('deep research degrades gracefully when planning output has no subtasks', async () => {
    const requests: ChatParams[] = [];
    const gateway = createGateway(
      [
        [{ type: 'content', delta: '我将直接研究这个问题' }, { type: 'done' }],
        [{ type: 'content', delta: '普通回答' }, { type: 'done' }],
      ],
      requests,
    );
    const loop = createAgentLoop({
      llmGateway: gateway,
      agentService: {
        getById: async () => ({ ...baseAgent, research: { depth: 'quick' } }),
      },
    });

    const chunks = await collect(
      loop.runStream({
        agentId: 'agent',
        userId: 'user',
        tenantId: 'tenant',
        message: '研究',
      }),
    );

    // 无子问题 → 无 researching/synthesizing 阶段、无 sources，规划轮即结束
    expect(chunks.filter((c) => c.type === 'stage').map((c) => (c as { stage: string }).stage)).toEqual(['planning']);
    expect(chunks.some((c) => c.type === 'sources')).toBe(false);
    expect(requests.length).toBe(1);
  });
});

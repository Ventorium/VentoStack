import { describe, expect, test } from 'bun:test';
import { createLLMGateway } from '../../llm-gateway/gateway';
import type { ChatParams, ChatResult, LLMProvider, StreamChunk } from '../../llm-gateway/types';

function createProvider(name: string, calls: ChatParams[]): LLMProvider {
  return {
    name,
    capabilities: {
      functionCalling: true,
      maxContextLength: 128000,
      supportsVision: false,
      supportsStreaming: true,
    },
    async chat(params): Promise<ChatResult> {
      calls.push(params);
      return {
        content: 'ok',
        usage: { promptTokens: 1, completionTokens: 1 },
        finishReason: 'stop',
      };
    },
    async *chatStream(params): AsyncIterable<StreamChunk> {
      calls.push(params);
      yield { type: 'done' };
    },
    async listModels() {
      return [];
    },
  };
}

describe('createLLMGateway', () => {
  test('strips the static provider prefix before sending the model', async () => {
    const calls: ChatParams[] = [];
    const gateway = createLLMGateway({
      providers: [createProvider('openai', calls)],
      defaultModel: 'gpt-4o-mini',
    });

    await gateway.chat({
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(calls[0]?.model).toBe('gpt-4o');
  });

  test('uses the dynamic tenant-aware provider resolver', async () => {
    const calls: ChatParams[] = [];
    const dynamicProvider = createProvider('tenant-provider', calls);
    const gateway = createLLMGateway({
      providers: [],
      defaultModel: 'default',
      async resolveProvider(model, tenantId) {
        expect(model).toBe('default');
        expect(tenantId).toBe('tenant-a');
        return { provider: dynamicProvider, model: 'tenant-model' };
      },
    });

    await gateway.chat({
      model: 'default',
      tenantId: 'tenant-a',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(calls[0]?.model).toBe('tenant-model');
  });
});

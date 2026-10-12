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

  test('resolveProviderFor 解析动态 provider 并暴露能力，按 tenant 隔离缓存', async () => {
    const calls: ChatParams[] = [];
    const resolved: string[] = [];
    const gateway = createLLMGateway({
      providers: [],
      defaultModel: 'default',
      async resolveProvider(model, tenantId) {
        resolved.push(`${tenantId}|${model}`);
        return { provider: createProvider(`p-${tenantId}`, calls), model };
      },
    });

    const a = await gateway.resolveProviderFor('coding-free', 'tenant-a');
    expect(a?.capabilities.maxContextLength).toBe(128000);
    expect(a?.name).toBe('p-tenant-a');

    // 命中缓存：同一 tenant + model 不再回源
    await gateway.resolveProviderFor('coding-free', 'tenant-a');
    expect(resolved).toEqual(['tenant-a|coding-free']);

    // 换租户必须重新解析（不同租户可能是完全不同的 provider 配置）
    const b = await gateway.resolveProviderFor('coding-free', 'tenant-b');
    expect(b?.name).toBe('p-tenant-b');
    expect(resolved).toEqual(['tenant-a|coding-free', 'tenant-b|coding-free']);
  });

  test('resolveProviderFor 静态 provider 走前缀解析，未知引用返回 undefined', async () => {
    const calls: ChatParams[] = [];
    const gateway = createLLMGateway({
      providers: [createProvider('openai', calls)],
      defaultModel: 'gpt-4o-mini',
    });

    const found = await gateway.resolveProviderFor('openai/gpt-4o');
    expect(found?.name).toBe('openai');

    expect(await gateway.resolveProviderFor('nope/model')).toBeUndefined();
  });
});

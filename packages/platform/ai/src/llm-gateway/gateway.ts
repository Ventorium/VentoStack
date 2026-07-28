/**
 * LLM Gateway 工厂
 * 多 provider 支持、并发队列、重试、降级
 */
import { aiErrors } from '../errors';
import { createRequestQueue } from './queue';
import { withRetry } from './retry';
import type {
  ChatParams,
  ChatResult,
  LLMGateway,
  LLMGatewayConfig,
  LLMProvider,
  StreamChunk,
} from './types';

export function createLLMGateway(config: LLMGatewayConfig): LLMGateway {
  const providers = new Map<string, LLMProvider>();
  for (const p of config.providers) {
    providers.set(p.name, p);
  }

  const queue = createRequestQueue({
    ...(config.maxConcurrent !== undefined ? { maxConcurrent: config.maxConcurrent } : {}),
    ...(config.maxQueued !== undefined ? { maxQueued: config.maxQueued } : {}),
    ...(config.queueTimeoutMs !== undefined ? { queueTimeoutMs: config.queueTimeoutMs } : {}),
  });

  function getStaticProviderForModel(model: string): { provider: LLMProvider; model: string } {
    // 如果 model 包含 provider 前缀（如 "openai/gpt-4o"），解析出来
    const slashIdx = model.indexOf('/');
    if (slashIdx > 0) {
      const providerName = model.slice(0, slashIdx);
      const p = providers.get(providerName);
      if (p) return { provider: p, model: model.slice(slashIdx + 1) };
    }
    // 否则使用默认 provider
    return { provider: getDefaultProvider(), model };
  }

  async function resolveRequest(
    params: ChatParams,
  ): Promise<{ provider: LLMProvider; params: ChatParams }> {
    const requestedModel =
      !params.model || params.model === 'default' ? config.defaultModel : params.model;
    const dynamic = config.resolveProvider
      ? await config.resolveProvider(requestedModel, params.tenantId)
      : null;
    const resolved = dynamic ?? getStaticProviderForModel(requestedModel);
    return {
      provider: resolved.provider,
      params: { ...params, model: resolved.model },
    };
  }

  function getDefaultProvider(): LLMProvider {
    const name = config.defaultProvider ?? config.providers[0]?.name;
    const p = name ? providers.get(name) : undefined;
    if (!p) throw aiErrors.llmAllFailed();
    return p;
  }

  return {
    async chat(params: ChatParams): Promise<ChatResult> {
      const resolved = await resolveRequest(params);
      await queue.acquire();
      try {
        return await withRetry(() => resolved.provider.chat(resolved.params));
      } finally {
        queue.release();
      }
    },

    async *chatStream(params: ChatParams): AsyncIterable<StreamChunk> {
      const resolved = await resolveRequest(params);
      await queue.acquire();
      try {
        yield* resolved.provider.chatStream(resolved.params);
      } finally {
        queue.release();
      }
    },

    getProvider(name: string): LLMProvider | undefined {
      return providers.get(name);
    },

    getDefaultProvider(): LLMProvider {
      return getDefaultProvider();
    },

    listProviders(): LLMProvider[] {
      return Array.from(providers.values());
    },
  };
}

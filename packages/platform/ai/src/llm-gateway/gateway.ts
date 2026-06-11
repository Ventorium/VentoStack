/**
 * LLM Gateway 工厂
 * 多 provider 支持、并发队列、重试、降级
 */
import { aiErrors } from "../errors";
import { createRequestQueue } from "./queue";
import { withRetry } from "./retry";
import type {
  ChatParams,
  ChatResult,
  LLMGateway,
  LLMGatewayConfig,
  LLMProvider,
  StreamChunk,
} from "./types";

export function createLLMGateway(config: LLMGatewayConfig): LLMGateway {
  const providers = new Map<string, LLMProvider>();
  for (const p of config.providers) {
    providers.set(p.name, p);
  }

  const queue = createRequestQueue({
    maxConcurrent: config.maxConcurrent,
    maxQueued: config.maxQueued,
    queueTimeoutMs: config.queueTimeoutMs,
  });

  function getProviderForModel(model: string): LLMProvider {
    // 如果 model 包含 provider 前缀（如 "openai/gpt-4o"），解析出来
    const slashIdx = model.indexOf("/");
    if (slashIdx > 0) {
      const providerName = model.slice(0, slashIdx);
      const p = providers.get(providerName);
      if (p) return p;
    }
    // 否则使用默认 provider
    return getDefaultProvider();
  }

  function getDefaultProvider(): LLMProvider {
    const name = config.defaultProvider ?? config.providers[0]?.name;
    const p = name ? providers.get(name) : undefined;
    if (!p) throw aiErrors.llmAllFailed();
    return p;
  }

  return {
    async chat(params: ChatParams): Promise<ChatResult> {
      const provider = getProviderForModel(params.model);
      await queue.acquire();
      try {
        return await withRetry(() => provider.chat(params));
      } finally {
        queue.release();
      }
    },

    async *chatStream(params: ChatParams): AsyncIterable<StreamChunk> {
      const provider = getProviderForModel(params.model);
      await queue.acquire();
      try {
        yield* provider.chatStream(params);
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

/**
 * 从 https://models.dev/api.json 获取供应商模型列表（含价格、推理选项）
 *
 * 数据结构:
 * {
 *   "provider-slug": {
 *     "id": "provider-slug",
 *     "models": {
 *       "model-id": {
 *         "id": "model-id",
 *         "name": "Display Name",
 *         "cost": { "input": 0.14, "output": 0.28 },
 *         "limit": { "context": 128000, "output": 8192 },
 *         "reasoning": true,
 *         "reasoning_options": [
 *           { "type": "toggle" },
 *           { "type": "effort", "values": ["low", "medium", "high"] }
 *         ],
 *         "tool_call": true,
 *         "structured_output": true,
 *         ...
 *       }
 *     }
 *   }
 * }
 *
 * 缓存策略: Redis 缓存 + ETag 校验，TTL 1 天
 */

/** 推理选项：toggle 类型 */
interface ReasoningToggle {
  type: "toggle";
}

/** 推理选项：effort 类型 */
interface ReasoningEffort {
  type: "effort";
  values: string[];
}

/** 推理选项：budget_tokens 类型 */
interface ReasoningBudgetTokens {
  type: "budget_tokens";
  min?: number;
  max?: number;
}

export type ReasoningOption = ReasoningToggle | ReasoningEffort | ReasoningBudgetTokens;

export interface FetchedModel {
  modelId: string;
  displayName: string;
  contextLength: number;
  maxOutputTokens: number;
  supportsText: boolean;
  supportsImage: boolean;
  supportsVideo: boolean;
  supportsAudio: boolean;
  supportsFunctionCalling: boolean;
  supportsThinking: boolean;
  supportsStructuredOutput: boolean;
  reasoningOptions: ReasoningOption[] | null;
  pricingInput: number | null;
  pricingOutput: number | null;
}

interface ModelsDevApiModel {
  id: string;
  name: string;
  reasoning?: boolean;
  reasoning_options?: Array<{
    type: string;
    values?: string[];
    min?: number;
    max?: number;
  }>;
  tool_call?: boolean;
  structured_output?: boolean | null;
  attachment?: boolean;
  temperature?: boolean;
  modalities?: {
    input?: string[];
    output?: string[];
  };
  limit?: {
    context?: number;
    output?: number;
  };
  cost?: {
    input?: number;
    output?: number;
    cache_read?: number;
    cache_write?: number;
  };
}

interface ModelsDevApiProvider {
  id: string;
  name?: string;
  models?: Record<string, ModelsDevApiModel>;
}

type ApiData = Record<string, ModelsDevApiProvider>;

/** 简易缓存接口（与 @ventostack/cache 的 CacheAdapter 兼容） */
interface SimpleCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
}

const API_URL = "https://models.dev/api.json";
const CACHE_PREFIX = "models-dev:";
const CACHE_ETAG_PREFIX = "models-dev:etag:";
const CACHE_TTL = 86400; // 1 天

/**
 * 从 models.dev 获取指定供应商的模型列表
 * 带 Redis 缓存 + ETag 增量校验
 *
 * @param providerSlug 供应商 slug（如 "openai", "deepseek", "anthropic"）
 * @param cache 可选的缓存实例
 */
export async function fetchModelsFromDev(
  providerSlug: string,
  cache?: SimpleCache,
): Promise<FetchedModel[]> {
  const cacheKey = `${CACHE_PREFIX}${providerSlug}`;
  const etagKey = `${CACHE_ETAG_PREFIX}${providerSlug}`;

  // 1. 尝试从缓存读取
  if (cache) {
    const cached = await cache.get(cacheKey).catch(() => null);
    if (cached) {
      try {
        return JSON.parse(cached) as FetchedModel[];
      } catch { /* cache corrupted, re-fetch */ }
    }
  }

  // 2. 获取 ETag
  let storedEtag: string | null = null;
  if (cache) {
    storedEtag = await cache.get(etagKey).catch(() => null);
  }

  // 3. 请求 api.json
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (storedEtag) {
    headers["If-None-Match"] = storedEtag;
  }

  const response = await fetch(API_URL, {
    headers,
    signal: AbortSignal.timeout(30000),
  });

  // 304 Not Modified → 缓存仍有效，刷新 TTL
  if (response.status === 304 && cache) {
    const cached = await cache.get(cacheKey).catch(() => null);
    if (cached) {
      await cache.set(cacheKey, cached, CACHE_TTL).catch(() => {});
      await cache.set(etagKey, storedEtag ?? "", CACHE_TTL).catch(() => {});
      return JSON.parse(cached) as FetchedModel[];
    }
    const retryResp = await fetch(API_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });
    if (!retryResp.ok) {
      throw new Error(`models.dev returned ${retryResp.status}`);
    }
    return await processResponse(retryResp, providerSlug, cache);
  }

  if (!response.ok) {
    throw new Error(`models.dev returned ${response.status}`);
  }

  return await processResponse(response, providerSlug, cache);
}

async function processResponse(
  response: Response,
  providerSlug: string,
  cache?: SimpleCache,
): Promise<FetchedModel[]> {
  const etag = response.headers.get("etag");
  const data = (await response.json()) as ApiData;

  const results = parseApiJson(data, providerSlug);

  // 缓存结果
  if (cache) {
    const cacheKey = `${CACHE_PREFIX}${providerSlug}`;
    const etagKey = `${CACHE_ETAG_PREFIX}${providerSlug}`;
    await cache.set(cacheKey, JSON.stringify(results), CACHE_TTL).catch(() => {});
    if (etag) {
      await cache.set(etagKey, etag, CACHE_TTL).catch(() => {});
    }
  }

  return results;
}

/**
 * 解析 api.json 数据，提取指定供应商的模型
 */
function parseApiJson(data: ApiData, providerSlug: string): FetchedModel[] {
  const results: FetchedModel[] = [];
  const provider = data[providerSlug];

  if (!provider?.models) return results;

  for (const [modelId, entry] of Object.entries(provider.models)) {
    const inputModalities = entry.modalities?.input ?? [];
    const allInput = inputModalities.map((m) => m.toLowerCase());

    // 解析 reasoning_options
    let reasoningOptions: ReasoningOption[] | null = null;
    if (entry.reasoning_options && entry.reasoning_options.length > 0) {
      reasoningOptions = entry.reasoning_options.map((opt) => {
        if (opt.type === "effort") {
          return { type: "effort" as const, values: opt.values ?? [] };
        }
        if (opt.type === "budget_tokens") {
          return { type: "budget_tokens" as const, ...(opt.min != null ? { min: opt.min } : {}), ...(opt.max != null ? { max: opt.max } : {}) };
        }
        return { type: "toggle" as const };
      });
    }

    results.push({
      modelId,
      displayName: entry.name ?? modelId,
      contextLength: entry.limit?.context ?? 128000,
      maxOutputTokens: entry.limit?.output ?? 4096,
      supportsText: allInput.includes("text"),
      supportsImage: allInput.includes("image"),
      supportsVideo: allInput.includes("video"),
      supportsAudio: allInput.includes("audio"),
      supportsFunctionCalling: entry.tool_call ?? false,
      supportsThinking: entry.reasoning ?? false,
      supportsStructuredOutput: entry.structured_output === true,
      reasoningOptions,
      pricingInput: entry.cost?.input ?? null,
      pricingOutput: entry.cost?.output ?? null,
    });
  }

  results.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return results;
}

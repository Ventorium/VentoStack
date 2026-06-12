/**
 * 从 https://models.dev/ 获取供应商模型列表
 *
 * 使用 JSON API: https://models.dev/models.json
 * 数据格式:
 * {
 *   "provider/model-id": {
 *     "id": "provider/model-id",
 *     "name": "Display Name",
 *     "reasoning": true/false,
 *     "tool_call": true/false,
 *     "modalities": { "input": ["text","image"], "output": ["text"] },
 *     "limit": { "context": 128000, "output": 8192 }
 *   }
 * }
 *
 * 注意: models.dev 不提供价格数据，需用户手动填写
 */

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
  pricingInput: number | null;
  pricingOutput: number | null;
}

interface ModelsDevEntry {
  id: string;
  name: string;
  reasoning?: boolean;
  tool_call?: boolean;
  temperature?: boolean;
  attachment?: boolean;
  structured_output?: boolean;
  modalities?: {
    input?: string[];
    output?: string[];
  };
  limit?: {
    context?: number;
    output?: number;
  };
}

/**
 * 从 models.dev JSON API 获取指定供应商的模型列表
 * @param providerSlug 供应商 slug（如 "openai", "anthropic", "google"）
 */
export async function fetchModelsFromDev(providerSlug: string): Promise<FetchedModel[]> {
  try {
    const response = await fetch("https://models.dev/models.json", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`models.dev returned ${response.status}`);
    }

    const data = (await response.json()) as Record<string, ModelsDevEntry>;
    return parseModelsJson(data, providerSlug);
  } catch (err) {
    throw new Error(
      `Failed to fetch models from models.dev for "${providerSlug}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * 解析 JSON 数据，提取指定供应商的模型
 */
function parseModelsJson(
  data: Record<string, ModelsDevEntry>,
  providerSlug: string,
): FetchedModel[] {
  const results: FetchedModel[] = [];
  const prefix = `${providerSlug}/`;

  for (const [key, entry] of Object.entries(data)) {
    // 匹配 "providerSlug/model-id" 格式
    if (!key.toLowerCase().startsWith(prefix.toLowerCase())) continue;

    const modelId = key.slice(prefix.length);
    if (!modelId) continue;

    const inputModalities = entry.modalities?.input ?? [];
    const allInput = inputModalities.map((m) => m.toLowerCase());

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
      supportsStructuredOutput: entry.structured_output ?? false,
      // models.dev 不提供价格数据，需用户手动填写
      pricingInput: null,
      pricingOutput: null,
    });
  }

  // 按名称排序
  results.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return results;
}

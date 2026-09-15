/**
 * 从供应商自身接口获取模型列表（OpenAI 兼容 GET {baseUrl}/models）
 *
 * 支持 apiFormat:
 * - openai_chat / openai_response / custom: Authorization: Bearer，响应 { data: [{ id, ... }] } 或裸数组
 * - anthropic: x-api-key + anthropic-version，响应 { data: [{ id, display_name }], has_more, last_id }，按 after 翻页
 */

import { VentoStackError } from '@ventostack/core';
import type { FetchedModel } from './models-dev';

/** anthropic 翻页上限，防止异常响应导致死循环 */
const MAX_ANTHROPIC_PAGES = 10;

interface RawModelEntry {
  id?: unknown;
  display_name?: unknown;
}

function toFetchedModel(entry: RawModelEntry): FetchedModel | null {
  const id = entry.id;
  if (typeof id !== 'string' || id.length === 0) return null;
  const displayName =
    typeof entry.display_name === 'string' && entry.display_name.length > 0
      ? entry.display_name
      : id;
  return {
    modelId: id,
    displayName,
    contextLength: 128000,
    maxOutputTokens: 4096,
    supportsText: true,
    supportsImage: false,
    supportsVideo: false,
    supportsAudio: false,
    supportsFunctionCalling: false,
    supportsThinking: false,
    supportsStructuredOutput: false,
    reasoningOptions: null,
    pricingInput: null,
    pricingOutput: null,
  };
}

/** 解析响应体为模型条目数组（兼容 { data: [...] } 与裸数组） */
function extractEntries(json: unknown): RawModelEntry[] {
  if (Array.isArray(json)) return json as RawModelEntry[];
  if (typeof json === 'object' && json !== null && Array.isArray((json as { data?: unknown }).data)) {
    return (json as { data: RawModelEntry[] }).data;
  }
  return [];
}

/**
 * 调用供应商 /models 接口获取模型列表
 * @param baseUrl - 供应商 Base URL（如 https://xxx.xx/v1）
 * @param apiKey - 已解密的 API Key
 * @param apiFormat - API 格式（openai_chat / openai_response / anthropic / custom）
 * @returns 去重、按 displayName 排序后的模型列表
 */
export async function fetchModelsFromProviderApi(
  baseUrl: string,
  apiKey: string,
  apiFormat: string,
): Promise<FetchedModel[]> {
  if (!apiKey || apiKey.trim().length === 0) {
    // 抛 VentoStackError（而非裸 Error），让路由 handleError 返回 4xx 与具体原因，
    // 而不是统一 500 "服务器内部错误" 掩盖配置问题
    throw new VentoStackError('供应商未配置 API Key，无法同步模型', 400, 'provider_no_api_key');
  }

  const base = baseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> =
    apiFormat === 'anthropic'
      ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
      : { Authorization: `Bearer ${apiKey}` };

  const entries: RawModelEntry[] = [];

  /** 拉取并解析响应，网络/上游异常统一转为 VentoStackError（4xx + 具体原因） */
  async function fetchJson(url: string): Promise<unknown> {
    let resp: Response;
    try {
      resp = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
    } catch {
      throw new VentoStackError(`无法连接供应商接口: ${base}`, 400, 'provider_api_unreachable');
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      // 供应商错误响应（如 401 invalid key）对管理员可读，帮助定位配置问题
      throw new VentoStackError(
        `供应商接口返回 ${resp.status}: ${text.slice(0, 200)}`,
        400,
        'provider_api_error',
      );
    }
    const json = (await resp.json().catch(() => null)) as unknown;
    if (json === null) {
      throw new VentoStackError('供应商接口返回了无法解析的响应', 400, 'provider_api_invalid_response');
    }
    return json;
  }

  if (apiFormat === 'anthropic') {
    let after = '';
    let lastId = '';
    for (let page = 0; page < MAX_ANTHROPIC_PAGES; page++) {
      const url = `${base}/models?limit=1000${after ? `&after=${encodeURIComponent(after)}` : ''}`;
      const json = (await fetchJson(url)) as
        | { data?: RawModelEntry[]; has_more?: boolean; last_id?: string }
        | null;
      if (!json) break;
      entries.push(...extractEntries(json));
      const nextLastId = typeof json.last_id === 'string' ? json.last_id : '';
      if (!json.has_more || !nextLastId || nextLastId === lastId || entries.length === 0) break;
      lastId = nextLastId;
      after = nextLastId;
    }
  } else {
    entries.push(...extractEntries(await fetchJson(`${base}/models`)));
  }

  // 去重（部分网关会返回重复条目）
  const seen = new Set<string>();
  const models: FetchedModel[] = [];
  for (const entry of entries) {
    const model = toFetchedModel(entry);
    if (!model || seen.has(model.modelId)) continue;
    seen.add(model.modelId);
    models.push(model);
  }

  models.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return models;
}

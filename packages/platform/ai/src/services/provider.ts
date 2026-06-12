/**
 * AI 供应商与模型管理服务
 */

import type { Database } from "@ventostack/database";
import { fetchModelsFromDev, type FetchedModel, type ReasoningOption } from "./models-dev";
import { getPresetById } from "./provider-presets";

export type { ReasoningOption } from "./models-dev";

export interface CreateProviderParams {
  name: string;
  displayName?: string;
  apiFormat: string;
  baseUrl: string;
  apiKey: string;
  headers?: Record<string, string>;
  extra?: Record<string, unknown>;
  presetId?: string;
  sort?: number;
}

export interface UpdateProviderParams {
  displayName?: string;
  apiFormat?: string;
  baseUrl?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  extra?: Record<string, unknown>;
  status?: number;
  sort?: number;
}

export interface ProviderItem {
  id: string;
  name: string;
  displayName: string | null;
  apiFormat: string;
  baseUrl: string;
  apiKey: string;
  headers: Record<string, string> | null;
  extra: Record<string, unknown> | null;
  presetId: string | null;
  status: number;
  sort: number;
  modelCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ModelItem {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string | null;
  contextLength: number;
  maxOutputTokens: number;
  supportsText: boolean;
  supportsImage: boolean;
  supportsVideo: boolean;
  supportsAudio: boolean;
  supportsFunctionCalling: boolean;
  supportsStreaming: boolean;
  supportsThinking: boolean;
  supportsStructuredOutput: boolean;
  reasoningOptions: ReasoningOption[] | null;
  pricingInput: number | null;
  pricingOutput: number | null;
  autoFetched: boolean;
  status: number;
  sort: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateModelParams {
  displayName?: string;
  contextLength?: number;
  maxOutputTokens?: number;
  supportsText?: boolean;
  supportsImage?: boolean;
  supportsVideo?: boolean;
  supportsAudio?: boolean;
  supportsFunctionCalling?: boolean;
  supportsStreaming?: boolean;
  supportsThinking?: boolean;
  supportsStructuredOutput?: boolean;
  reasoningOptions?: ReasoningOption[] | null;
  pricingInput?: number | null;
  pricingOutput?: number | null;
  status?: number;
  sort?: number;
}

export interface SyncResult {
  added: number;
  updated: number;
  removed: number;
  total: number;
}

export function createProviderService(deps: { db: Database; cache?: { get(key: string): Promise<string | null>; set(key: string, value: string, ttl?: number): Promise<void> } }) {
  const { db, cache } = deps;

  // ============ Provider CRUD ============

  async function createProvider(tenantId: string, params: CreateProviderParams): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    await db.raw(
      `INSERT INTO ai_provider (id, name, display_name, api_format, base_url, api_key, headers, extra, preset_id, sort, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        params.name,
        params.displayName ?? params.name,
        params.apiFormat,
        params.baseUrl,
        params.apiKey,
        params.headers ? JSON.stringify(params.headers) : null,
        params.extra ? JSON.stringify(params.extra) : null,
        params.presetId ?? null,
        params.sort ?? 0,
        tenantId,
      ],
    );
    return { id };
  }

  async function updateProvider(id: string, tenantId: string, params: UpdateProviderParams): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params.displayName !== undefined) { sets.push(`display_name = $${idx++}`); values.push(params.displayName); }
    if (params.apiFormat !== undefined) { sets.push(`api_format = $${idx++}`); values.push(params.apiFormat); }
    if (params.baseUrl !== undefined) { sets.push(`base_url = $${idx++}`); values.push(params.baseUrl); }
    if (params.apiKey !== undefined) { sets.push(`api_key = $${idx++}`); values.push(params.apiKey); }
    if (params.headers !== undefined) { sets.push(`headers = $${idx++}`); values.push(JSON.stringify(params.headers)); }
    if (params.extra !== undefined) { sets.push(`extra = $${idx++}`); values.push(JSON.stringify(params.extra)); }
    if (params.status !== undefined) { sets.push(`status = $${idx++}`); values.push(params.status); }
    if (params.sort !== undefined) { sets.push(`sort = $${idx++}`); values.push(params.sort); }

    if (sets.length === 0) return;
    sets.push(`updated_at = NOW()`);
    values.push(id, tenantId);

    await db.raw(
      `UPDATE ai_provider SET ${sets.join(", ")} WHERE id = $${idx} AND tenant_id = $${idx + 1}`,
      values,
    );
  }

  async function deleteProvider(id: string, tenantId: string): Promise<void> {
    await db.raw(`DELETE FROM ai_provider WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  }

  async function getProviderById(id: string, tenantId: string): Promise<ProviderItem | null> {
    const rows = await db.raw(
      `SELECT p.*,
              (SELECT COUNT(*) FROM ai_model m WHERE m.provider_id = p.id) AS model_count
       FROM ai_provider p
       WHERE p.id = $1 AND p.tenant_id = $2`,
      [id, tenantId],
    );
    return rows.length > 0 ? mapProvider(rows[0] as Record<string, unknown>) : null;
  }

  async function listProviders(tenantId: string): Promise<ProviderItem[]> {
    const rows = await db.raw(
      `SELECT p.*,
              (SELECT COUNT(*) FROM ai_model m WHERE m.provider_id = p.id) AS model_count
       FROM ai_provider p
       WHERE p.tenant_id = $1
       ORDER BY p.sort ASC, p.created_at ASC`,
      [tenantId],
    );
    return (rows as Array<Record<string, unknown>>).map(mapProvider);
  }

  // ============ Model CRUD ============

  async function listModels(providerId: string, tenantId: string): Promise<ModelItem[]> {
    const rows = await db.raw(
      `SELECT * FROM ai_model WHERE provider_id = $1 AND tenant_id = $2 ORDER BY status DESC, sort ASC, created_at ASC`,
      [providerId, tenantId],
    );
    return (rows as Array<Record<string, unknown>>).map(mapModel);
  }

  async function listAllModels(tenantId: string): Promise<ModelItem[]> {
    const rows = await db.raw(
      `SELECT * FROM ai_model WHERE tenant_id = $1 AND status = 1 ORDER BY sort ASC, created_at ASC`,
      [tenantId],
    );
    return (rows as Array<Record<string, unknown>>).map(mapModel);
  }

  async function updateModel(id: string, tenantId: string, params: UpdateModelParams): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params.displayName !== undefined) { sets.push(`display_name = $${idx++}`); values.push(params.displayName); }
    if (params.contextLength !== undefined) { sets.push(`context_length = $${idx++}`); values.push(params.contextLength); }
    if (params.maxOutputTokens !== undefined) { sets.push(`max_output_tokens = $${idx++}`); values.push(params.maxOutputTokens); }
    if (params.supportsText !== undefined) { sets.push(`supports_text = $${idx++}`); values.push(params.supportsText); }
    if (params.supportsImage !== undefined) { sets.push(`supports_image = $${idx++}`); values.push(params.supportsImage); }
    if (params.supportsVideo !== undefined) { sets.push(`supports_video = $${idx++}`); values.push(params.supportsVideo); }
    if (params.supportsAudio !== undefined) { sets.push(`supports_audio = $${idx++}`); values.push(params.supportsAudio); }
    if (params.supportsFunctionCalling !== undefined) { sets.push(`supports_function_calling = $${idx++}`); values.push(params.supportsFunctionCalling); }
    if (params.supportsStreaming !== undefined) { sets.push(`supports_streaming = $${idx++}`); values.push(params.supportsStreaming); }
    if (params.supportsThinking !== undefined) { sets.push(`supports_thinking = $${idx++}`); values.push(params.supportsThinking); }
    if (params.supportsStructuredOutput !== undefined) { sets.push(`supports_structured_output = $${idx++}`); values.push(params.supportsStructuredOutput); }
    if (params.reasoningOptions !== undefined) { sets.push(`reasoning_options = $${idx++}`); values.push(params.reasoningOptions ? JSON.stringify(params.reasoningOptions) : null); }
    if (params.pricingInput !== undefined) { sets.push(`pricing_input = $${idx++}`); values.push(params.pricingInput); }
    if (params.pricingOutput !== undefined) { sets.push(`pricing_output = $${idx++}`); values.push(params.pricingOutput); }
    if (params.status !== undefined) { sets.push(`status = $${idx++}`); values.push(params.status); }
    if (params.sort !== undefined) { sets.push(`sort = $${idx++}`); values.push(params.sort); }

    if (sets.length === 0) return;
    sets.push(`updated_at = NOW()`);
    values.push(id, tenantId);

    await db.raw(
      `UPDATE ai_model SET ${sets.join(", ")} WHERE id = $${idx} AND tenant_id = $${idx + 1}`,
      values,
    );
  }

  // ============ Sync from models.dev ============

  async function syncModels(providerId: string, tenantId: string): Promise<SyncResult> {
    // Validate provider exists
    const provider = await getProviderById(providerId, tenantId);
    if (!provider) throw new Error("Provider not found");

    // Auto-resolve models.dev slug from provider's preset
    const preset = provider.presetId ? getPresetById(provider.presetId) : undefined;
    const providerSlug = preset?.modelsDevSlug;
    if (!providerSlug) throw new Error("Provider has no preset configured for models.dev sync");

    const fetched = await fetchModelsFromDev(providerSlug, cache);

    // 获取现有模型
    const existingRows = await db.raw(
      `SELECT id, model_id FROM ai_model WHERE provider_id = $1 AND tenant_id = $2`,
      [providerId, tenantId],
    );
    const existingMap = new Map<string, string>();
    for (const row of existingRows as Array<{ id: string; model_id: string }>) {
      existingMap.set(row.model_id, row.id);
    }

    const fetchedIds = new Set(fetched.map((f) => f.modelId));
    let added = 0;
    let updated = 0;

    for (const model of fetched) {
      const existingId = existingMap.get(model.modelId);
      if (existingId) {
        // 更新已有模型
        await db.raw(
          `UPDATE ai_model SET
             display_name = $1, context_length = $2, max_output_tokens = $3,
             supports_text = $4, supports_image = $5, supports_video = $6, supports_audio = $7,
             supports_function_calling = $8, supports_thinking = $9, supports_structured_output = $10,
             reasoning_options = $11,
             pricing_input = $12, pricing_output = $13,
             auto_fetched = TRUE, updated_at = NOW()
           WHERE id = $14`,
          [
            model.displayName, model.contextLength, model.maxOutputTokens,
            model.supportsText, model.supportsImage, model.supportsVideo, model.supportsAudio,
            model.supportsFunctionCalling, model.supportsThinking, model.supportsStructuredOutput,
            model.reasoningOptions ? JSON.stringify(model.reasoningOptions) : null,
            model.pricingInput, model.pricingOutput,
            existingId,
          ],
        );
        updated++;
      } else {
        // 新增模型
        await db.raw(
          `INSERT INTO ai_model (id, provider_id, model_id, display_name, context_length, max_output_tokens,
             supports_text, supports_image, supports_video, supports_audio,
             supports_function_calling, supports_thinking, supports_structured_output,
             reasoning_options,
             pricing_input, pricing_output, auto_fetched, tenant_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, TRUE, $17)`,
          [
            crypto.randomUUID(), providerId, model.modelId, model.displayName,
            model.contextLength, model.maxOutputTokens,
            model.supportsText, model.supportsImage, model.supportsVideo, model.supportsAudio,
            model.supportsFunctionCalling, model.supportsThinking, model.supportsStructuredOutput,
            model.reasoningOptions ? JSON.stringify(model.reasoningOptions) : null,
            model.pricingInput, model.pricingOutput,
            tenantId,
          ],
        );
        added++;
      }
    }

    // 删除 models.dev 中已不存在的自动拉取模型（保留用户手动添加的）
    let removed = 0;
    for (const [modelId, dbId] of existingMap) {
      if (!fetchedIds.has(modelId)) {
        const check = await db.raw(
          `SELECT auto_fetched FROM ai_model WHERE id = $1`,
          [dbId],
        );
        if (check.length > 0 && (check[0] as { auto_fetched: boolean }).auto_fetched) {
          await db.raw(`DELETE FROM ai_model WHERE id = $1`, [dbId]);
          removed++;
        }
      }
    }

    return { added, updated, removed, total: fetched.length };
  }

  // ============ Config (default model) ============

  async function getConfig(key: string): Promise<string | null> {
    const rows = await db.raw(
      `SELECT config_value FROM ai_config WHERE config_key = $1`,
      [key],
    );
    return rows.length > 0 ? (rows[0] as { config_value: string | null }).config_value : null;
  }

  async function setConfig(key: string, value: string): Promise<void> {
    await db.raw(
      `INSERT INTO ai_config (config_key, config_value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (config_key) DO UPDATE SET config_value = $2, updated_at = NOW()`,
      [key, value],
    );
  }

  // ============ Helpers ============

  function mapProvider(r: Record<string, unknown>): ProviderItem {
    return {
      id: r.id as string,
      name: r.name as string,
      displayName: (r.display_name as string) ?? null,
      apiFormat: r.api_format as string,
      baseUrl: r.base_url as string,
      apiKey: r.api_key as string,
      headers: typeof r.headers === "string" ? JSON.parse(r.headers) : (r.headers as Record<string, string> | null),
      extra: typeof r.extra === "string" ? JSON.parse(r.extra) : (r.extra as Record<string, unknown> | null),
      presetId: (r.preset_id as string) ?? null,
      status: (r.status as number) ?? 1,
      sort: (r.sort as number) ?? 0,
      modelCount: Number(r.model_count ?? 0),
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ""),
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at ?? ""),
    };
  }

  function mapModel(r: Record<string, unknown>): ModelItem {
    let reasoningOptions: ReasoningOption[] | null = null;
    const raw = r.reasoning_options;
    if (raw) {
      if (typeof raw === "string") {
        try { reasoningOptions = JSON.parse(raw); } catch { /* ignore */ }
      } else if (Array.isArray(raw)) {
        reasoningOptions = raw as ReasoningOption[];
      }
    }

    return {
      id: r.id as string,
      providerId: r.provider_id as string,
      modelId: r.model_id as string,
      displayName: (r.display_name as string) ?? null,
      contextLength: (r.context_length as number) ?? 128000,
      maxOutputTokens: (r.max_output_tokens as number) ?? 4096,
      supportsText: (r.supports_text as boolean) ?? true,
      supportsImage: (r.supports_image as boolean) ?? false,
      supportsVideo: (r.supports_video as boolean) ?? false,
      supportsAudio: (r.supports_audio as boolean) ?? false,
      supportsFunctionCalling: (r.supports_function_calling as boolean) ?? false,
      supportsStreaming: (r.supports_streaming as boolean) ?? true,
      supportsThinking: (r.supports_thinking as boolean) ?? false,
      supportsStructuredOutput: (r.supports_structured_output as boolean) ?? false,
      reasoningOptions,
      pricingInput: r.pricing_input != null ? Number(r.pricing_input) : null,
      pricingOutput: r.pricing_output != null ? Number(r.pricing_output) : null,
      autoFetched: (r.auto_fetched as boolean) ?? false,
      status: (r.status as number) ?? 1,
      sort: (r.sort as number) ?? 0,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ""),
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at ?? ""),
    };
  }

  async function deleteModel(id: string, tenantId: string): Promise<void> {
    await db.raw(`DELETE FROM ai_model WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  }

  async function createModel(tenantId: string, params: {
    providerId: string;
    modelId: string;
    displayName?: string;
    contextLength?: number;
    maxOutputTokens?: number;
  }): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    await db.raw(
      `INSERT INTO ai_model (id, provider_id, model_id, display_name, context_length, max_output_tokens,
         supports_text, supports_function_calling, supports_streaming, auto_fetched, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, TRUE, TRUE, FALSE, $7)`,
      [id, params.providerId, params.modelId, params.displayName ?? params.modelId, params.contextLength ?? 128000, params.maxOutputTokens ?? 4096, tenantId],
    );
    return { id };
  }

  async function deleteModels(ids: string[], tenantId: string): Promise<number> {
    if (ids.length === 0) return 0;
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    const result = await db.raw(
      `DELETE FROM ai_model WHERE id IN (${placeholders}) AND tenant_id = $${ids.length + 1}`,
      [...ids, tenantId],
    );
    return ids.length;
  }

  async function getModel(id: string, tenantId: string): Promise<ModelItem | null> {
    const rows = await db.raw(
      `SELECT * FROM ai_model WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    return rows.length > 0 ? mapModel(rows[0] as Record<string, unknown>) : null;
  }

  async function getProviderApiKey(providerId: string, tenantId: string): Promise<{ baseUrl: string; apiKey: string; apiFormat: string } | null> {
    const rows = await db.raw(
      `SELECT base_url, api_key, api_format FROM ai_provider WHERE id = $1 AND tenant_id = $2`,
      [providerId, tenantId],
    );
    if (rows.length === 0) return null;
    const r = rows[0] as { base_url: string; api_key: string; api_format: string };
    return { baseUrl: r.base_url, apiKey: r.api_key, apiFormat: r.api_format };
  }

  return {
    createProvider,
    updateProvider,
    deleteProvider,
    getProviderById,
    listProviders,
    listModels,
    listAllModels,
    updateModel,
    deleteModel,
    createModel,
    deleteModels,
    getModel,
    getProviderApiKey,
    syncModels,
    getConfig,
    setConfig,
  };
}

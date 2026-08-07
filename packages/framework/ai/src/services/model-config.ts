/**
 * 模型用途配置服务
 * 管理不同业务场景的默认模型分配
 * 存储在 ai_config 表中，key 为用途标识，value 为 model_id
 *
 * 预设用途：
 * - default_chat: 默认对话模型
 * - title_summary: 对话标题总结模型
 * - qa_default: 问答默认模型
 * - fast_task: 快速任务模型
 * - advanced_task: 高阶任务模型
 * - coding: 代码生成模型
 */
import type { Database } from "@ventostack/database";

export interface ModelPurposeConfig {
  purpose: string;
  label: string;
  description: string;
  modelId: string | null;
}

export interface ModelConfigService {
  /** 获取所有模型用途配置 */
  getAll(): Promise<ModelPurposeConfig[]>;
  /** 获取指定用途的模型 ID */
  get(purpose: string): Promise<string | null>;
  /** 设置指定用途的模型 ID */
  set(purpose: string, modelId: string): Promise<void>;
  /** 删除指定用途的模型配置 */
  remove(purpose: string): Promise<void>;
  /** 批量设置 */
  setBatch(configs: Array<{ purpose: string; modelId: string }>): Promise<void>;
  /** 根据用途获取模型详情（含 provider 信息） */
  getModelByPurpose(purpose: string): Promise<ModelDetail | null>;
}

export interface ModelDetail {
  modelId: string;
  displayName: string | null;
  providerName: string;
  providerDisplayName: string | null;
  contextLength: number;
  maxOutputTokens: number;
  supportsFunctionCalling: boolean;
  supportsStreaming: boolean;
}

const PURPOSE_DEFINITIONS: Array<{ purpose: string; label: string; description: string }> = [
  { purpose: "default_chat", label: "默认对话模型", description: "用户对话时使用的默认模型" },
  { purpose: "title_summary", label: "标题总结模型", description: "自动生成对话标题摘要的模型（通常用轻量模型）" },
  { purpose: "qa_default", label: "问答默认模型", description: "知识库问答场景的默认模型" },
  { purpose: "fast_task", label: "快速任务模型", description: "简单任务、分类、提取等低延迟场景" },
  { purpose: "advanced_task", label: "高阶任务模型", description: "复杂推理、长文本分析等高质量场景" },
  { purpose: "coding", label: "代码生成模型", description: "代码生成、审查、调试等编程场景" },
  { purpose: "skill_creator", label: "技能创建模型", description: "在线创建 AI 技能（Skill）时使用的模型" },
];

const CONFIG_KEY_PREFIX = "model_purpose_";

export function createModelConfigService(deps: { db: Database }): ModelConfigService {
  const { db } = deps;

  async function get(purpose: string): Promise<string | null> {
    const rows = await db.raw(
      `SELECT config_value FROM ai_config WHERE config_key = $1`,
      [`${CONFIG_KEY_PREFIX}${purpose}`],
    ) as Array<Record<string, unknown>>;
    return rows.length > 0 ? (rows[0].config_value as string) : null;
  }

  async function set(purpose: string, modelId: string): Promise<void> {
    await db.raw(
      `INSERT INTO ai_config (config_key, config_value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (config_key) DO UPDATE SET config_value = $2, updated_at = NOW()`,
      [`${CONFIG_KEY_PREFIX}${purpose}`, modelId],
    );
  }

  async function remove(purpose: string): Promise<void> {
    await db.raw(`DELETE FROM ai_config WHERE config_key = $1`, [`${CONFIG_KEY_PREFIX}${purpose}`]);
  }

  async function getAll(): Promise<ModelPurposeConfig[]> {
    const results: ModelPurposeConfig[] = [];
    for (const def of PURPOSE_DEFINITIONS) {
      const modelId = await get(def.purpose);
      results.push({ ...def, modelId });
    }
    return results;
  }

  async function setBatch(configs: Array<{ purpose: string; modelId: string }>): Promise<void> {
    for (const c of configs) {
      await set(c.purpose, c.modelId);
    }
  }

  async function getModelByPurpose(purpose: string): Promise<ModelDetail | null> {
    const modelId = await get(purpose);
    if (!modelId) return null;

    const rows = await db.raw(
      `SELECT m.model_id, m.display_name, m.context_length, m.max_output_tokens,
              m.supports_function_calling, m.supports_streaming,
              p.name as provider_name, p.display_name as provider_display_name
       FROM ai_model m
       JOIN ai_provider p ON m.provider_id = p.id
       WHERE m.model_id = $1 AND m.status = 1
       LIMIT 1`,
      [modelId],
    ) as Array<Record<string, unknown>>;

    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      modelId: r.model_id as string,
      displayName: (r.display_name as string) ?? null,
      providerName: r.provider_name as string,
      providerDisplayName: (r.provider_display_name as string) ?? null,
      contextLength: Number(r.context_length ?? 128000),
      maxOutputTokens: Number(r.max_output_tokens ?? 4096),
      supportsFunctionCalling: Boolean(r.supports_function_calling),
      supportsStreaming: Boolean(r.supports_streaming),
    };
  }

  return { getAll, get, set, remove, setBatch, getModelByPurpose };
}

/**
 * 模型注册表 — 管理模型到 Provider 的映射
 *
 * 支持按模型 ID 前缀自动路由（如 "claude-*" → anthropic），
 * 也支持显式注册模型配置。
 */
import type { LLMProvider } from "./types";

/** 模型配置 */
export interface ModelConfig {
  /** 模型 ID（如 "gpt-4o", "claude-sonnet-4-20250514"） */
  id: string;
  /** 显示名称 */
  name: string;
  /** 所属 provider 名称 */
  provider: string;
  /** 上下文窗口大小 */
  contextLength: number;
  /** 最大输出 token 数 */
  maxTokens: number;
  /** 是否支持 function calling */
  supportsFunctionCalling: boolean;
  /** 是否支持视觉输入 */
  supportsVision: boolean;
  /** 是否支持推理/思考 */
  supportsReasoning: boolean;
  /** 输入价格（每百万 token） */
  inputCostPer1M?: number;
  /** 输出价格（每百万 token） */
  outputCostPer1M?: number;
}

/** 模型注册表 */
export interface ModelRegistry {
  /** 注册模型 */
  register(model: ModelConfig): void;
  /** 批量注册 */
  registerAll(models: ModelConfig[]): void;
  /** 获取模型配置 */
  get(modelId: string): ModelConfig | undefined;
  /** 列出所有模型 */
  list(): ModelConfig[];
  /** 按 provider 列出模型 */
  listByProvider(provider: string): ModelConfig[];
  /** 检查模型是否存在 */
  has(modelId: string): boolean;
}

/** 内置模型定义 */
const BUILTIN_MODELS: ModelConfig[] = [
  // OpenAI
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    contextLength: 128000,
    maxTokens: 16384,
    supportsFunctionCalling: true,
    supportsVision: true,
    supportsReasoning: false,
    inputCostPer1M: 2.5,
    outputCostPer1M: 10,
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    contextLength: 128000,
    maxTokens: 16384,
    supportsFunctionCalling: true,
    supportsVision: true,
    supportsReasoning: false,
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
  },
  {
    id: "o3-mini",
    name: "o3-mini",
    provider: "openai",
    contextLength: 200000,
    maxTokens: 100000,
    supportsFunctionCalling: true,
    supportsVision: true,
    supportsReasoning: true,
  },
  // Anthropic
  {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    provider: "anthropic",
    contextLength: 200000,
    maxTokens: 16384,
    supportsFunctionCalling: true,
    supportsVision: true,
    supportsReasoning: true,
    inputCostPer1M: 3,
    outputCostPer1M: 15,
  },
  {
    id: "claude-3-5-haiku-20241022",
    name: "Claude 3.5 Haiku",
    provider: "anthropic",
    contextLength: 200000,
    maxTokens: 8192,
    supportsFunctionCalling: true,
    supportsVision: true,
    supportsReasoning: false,
    inputCostPer1M: 0.8,
    outputCostPer1M: 4,
  },
  // Google
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "google",
    contextLength: 1048576,
    maxTokens: 8192,
    supportsFunctionCalling: true,
    supportsVision: true,
    supportsReasoning: false,
  },
  {
    id: "gemini-2.5-pro-preview-05-06",
    name: "Gemini 2.5 Pro",
    provider: "google",
    contextLength: 1048576,
    maxTokens: 65536,
    supportsFunctionCalling: true,
    supportsVision: true,
    supportsReasoning: true,
  },
];

export function createModelRegistry(
  builtinModels: boolean = true,
): ModelRegistry {
  const models = new Map<string, ModelConfig>();

  if (builtinModels) {
    for (const m of BUILTIN_MODELS) {
      models.set(m.id, m);
    }
  }

  function register(model: ModelConfig): void {
    models.set(model.id, model);
  }

  function registerAll(modelList: ModelConfig[]): void {
    for (const m of modelList) {
      models.set(m.id, m);
    }
  }

  function get(modelId: string): ModelConfig | undefined {
    // 精确匹配
    const exact = models.get(modelId);
    if (exact) return exact;
    // 前缀匹配（如 "openai/gpt-4o" → "gpt-4o"）
    const slashIdx = modelId.indexOf("/");
    if (slashIdx > 0) {
      return models.get(modelId.slice(slashIdx + 1));
    }
    return undefined;
  }

  function list(): ModelConfig[] {
    return [...models.values()];
  }

  function listByProvider(provider: string): ModelConfig[] {
    return [...models.values()].filter((m) => m.provider === provider);
  }

  function has(modelId: string): boolean {
    return get(modelId) !== undefined;
  }

  return { register, registerAll, get, list, listByProvider, has };
}

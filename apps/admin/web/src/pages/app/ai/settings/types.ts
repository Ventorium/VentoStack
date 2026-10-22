/**
 * AI 设置页 — 共享类型与常量
 */

export interface ProviderPreset {
  id: string;
  name: string;
  displayName: string;
  apiFormat: string;
  baseUrl: string;
  description: string;
  modelsDevSlug?: string;
}

export interface ProviderItem {
  id: string;
  name: string;
  displayName: string | null;
  apiFormat: string;
  baseUrl: string;
  apiKey: string;
  hasApiKey: boolean;
  headers: Record<string, string> | null;
  extra: Record<string, unknown> | null;
  presetId: string | null;
  modelsDevSlug: string | null;
  status: number;
  sort: number;
  modelCount: number;
  createdAt: string;
  updatedAt: string;
}

// 推理选项类型（与 models.dev reasoning_options 兼容）
export interface ReasoningToggle {
  type: 'toggle';
}
export interface ReasoningEffort {
  type: 'effort';
  values: string[];
}
export interface ReasoningBudgetTokens {
  type: 'budget_tokens';
  min?: number;
  max?: number;
}
export type ReasoningOption = ReasoningToggle | ReasoningEffort | ReasoningBudgetTokens;

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
}

export const FORMAT_LABELS: Record<string, { label: string; color: string }> = {
  openai_chat: { label: 'OpenAI Chat', color: 'green' },
  openai_response: { label: 'OpenAI Response', color: 'blue' },
  anthropic: { label: 'Anthropic', color: 'purple' },
  custom: { label: '自定义', color: 'default' },
  jev: { label: 'JEV (决策)', color: 'gold' },
};

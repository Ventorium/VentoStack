/**
 * AI 供应商预设
 * 参考 opencode 的做法，提供常见供应商的预配置
 */

export interface ProviderPreset {
  id: string;
  name: string;
  displayName: string;
  apiFormat: "openai_chat" | "openai_response" | "anthropic" | "custom";
  baseUrl: string;
  description: string;
  /** models.dev 中的 provider slug，用于自动拉取模型列表 */
  modelsDevSlug?: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "openai",
    name: "openai",
    displayName: "OpenAI",
    apiFormat: "openai_chat",
    baseUrl: "https://api.openai.com/v1",
    description: "GPT-4o, GPT-4.1, o3 等",
    modelsDevSlug: "openai",
  },
  {
    id: "anthropic",
    name: "anthropic",
    displayName: "Anthropic",
    apiFormat: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    description: "Claude Opus 4, Sonnet 4, Haiku 等",
    modelsDevSlug: "anthropic",
  },
  {
    id: "deepseek",
    name: "deepseek",
    displayName: "DeepSeek",
    apiFormat: "openai_chat",
    baseUrl: "https://api.deepseek.com/v1",
    description: "DeepSeek V4, R2 等",
    modelsDevSlug: "deepseek",
  },
  {
    id: "google",
    name: "google",
    displayName: "Google AI",
    apiFormat: "openai_chat",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    description: "Gemini 2.5 Pro/Flash 等",
    modelsDevSlug: "google",
  },
  {
    id: "mistral",
    name: "mistral",
    displayName: "Mistral",
    apiFormat: "openai_chat",
    baseUrl: "https://api.mistral.ai/v1",
    description: "Mistral Large, Medium, Codestral 等",
    modelsDevSlug: "mistral",
  },
  {
    id: "groq",
    name: "groq",
    displayName: "Groq",
    apiFormat: "openai_chat",
    baseUrl: "https://api.groq.com/openai/v1",
    description: "超高速推理，Llama, Mixtral 等",
    modelsDevSlug: "groq",
  },
  {
    id: "openrouter",
    name: "openrouter",
    displayName: "OpenRouter",
    apiFormat: "openai_chat",
    baseUrl: "https://openrouter.ai/api/v1",
    description: "多模型聚合网关",
    modelsDevSlug: "openrouter",
  },
  {
    id: "siliconflow",
    name: "siliconflow",
    displayName: "SiliconFlow",
    apiFormat: "openai_chat",
    baseUrl: "https://api.siliconflow.cn/v1",
    description: "硅基流动，国内高速推理",
  },
  {
    id: "zhipu",
    name: "zhipu",
    displayName: "智谱 AI",
    apiFormat: "openai_chat",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    description: "GLM-4 系列",
  },
  {
    id: "moonshot",
    name: "moonshot",
    displayName: "月之暗面 (Kimi)",
    apiFormat: "openai_chat",
    baseUrl: "https://api.moonshot.cn/v1",
    description: "Kimi K2 等",
  },
  {
    id: "alibaba",
    name: "alibaba",
    displayName: "阿里云百炼",
    apiFormat: "openai_chat",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    description: "通义千问 Qwen 系列",
  },
  {
    id: "volcengine",
    name: "volcengine",
    displayName: "火山引擎 (豆包)",
    apiFormat: "openai_chat",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    description: "豆包大模型系列",
  },
  {
    id: "custom_openai",
    name: "custom_openai",
    displayName: "自定义 (OpenAI 兼容)",
    apiFormat: "openai_chat",
    baseUrl: "",
    description: "任何兼容 OpenAI Chat Completions 格式的服务",
  },
  {
    id: "custom_anthropic",
    name: "custom_anthropic",
    displayName: "自定义 (Anthropic 兼容)",
    apiFormat: "anthropic",
    baseUrl: "",
    description: "任何兼容 Anthropic Messages 格式的服务",
  },
  {
    id: "xai",
    name: "xai",
    displayName: "xAI (Grok)",
    apiFormat: "openai_chat",
    baseUrl: "https://api.x.ai/v1",
    description: "Grok-4 系列",
    modelsDevSlug: "xai",
  },
  {
    id: "together",
    name: "together",
    displayName: "Together AI",
    apiFormat: "openai_chat",
    baseUrl: "https://api.together.xyz/v1",
    description: "开源模型聚合推理",
    modelsDevSlug: "together",
  },
  {
    id: "fireworks",
    name: "fireworks",
    displayName: "Fireworks AI",
    apiFormat: "openai_chat",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    description: "开源模型高速推理",
    modelsDevSlug: "fireworks",
  },
  {
    id: "cerebras",
    name: "cerebras",
    displayName: "Cerebras",
    apiFormat: "openai_chat",
    baseUrl: "https://api.cerebras.ai/v1",
    description: "超高速推理加速器",
    modelsDevSlug: "cerebras",
  },
  {
    id: "nvidia",
    name: "nvidia",
    displayName: "NVIDIA NIM",
    apiFormat: "openai_chat",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    description: "NVIDIA 推理微服务",
    modelsDevSlug: "nvidia",
  },
  {
    id: "huggingface",
    name: "huggingface",
    displayName: "Hugging Face",
    apiFormat: "openai_chat",
    baseUrl: "https://api-inference.huggingface.co/v1",
    description: "Hugging Face 推理端点",
    modelsDevSlug: "huggingface",
  },
  {
    id: "ollama",
    name: "ollama",
    displayName: "Ollama (本地)",
    apiFormat: "openai_chat",
    baseUrl: "http://localhost:11434/v1",
    description: "本地开源模型，默认 localhost",
  },
];

/** 获取预设列表 */
export function getPresets(): ProviderPreset[] {
  return PROVIDER_PRESETS;
}

/** 根据 ID 获取预设 */
export function getPresetById(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id);
}

/**
 * LLM Gateway 类型定义
 */

export interface LLMProvider {
  name: string;
  capabilities: ProviderCapabilities;
  chat(params: ChatParams): Promise<ChatResult>;
  chatStream(params: ChatParams): AsyncIterable<StreamChunk>;
  listModels(): Promise<ModelInfo[]>;
}

export interface ProviderCapabilities {
  functionCalling: boolean;
  maxContextLength: number;
  supportsVision: boolean;
  supportsStreaming: boolean;
  supportsReasoning?: boolean;
  supportsStructuredOutput?: boolean;
}

export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatParams {
  model: string;
  /** 租户标识，供动态 Provider 解析使用 */
  tenantId?: string;
  messages: ChatMessage[];
  tools?: LLMToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  thinkingLevel?: ThinkingLevel;
  /** 动态 API Key（每次请求解析，覆盖 provider 默认 key；对齐参考实现 getApiKey） */
  apiKey?: string;
  signal?: AbortSignal;
}

export interface ChatResult {
  content: string;
  toolCalls?: ToolCall[];
  usage: TokenUsage;
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
}

/** 研究阶段（DeepResearch 模式）：规划 → 并行子任务 → 综合产出 */
export type ResearchStage = 'planning' | 'researching' | 'synthesizing';

export interface ResearchStageChunk {
  type: 'stage';
  stage: ResearchStage;
}

/** 引用来源清单（DeepResearch 产出轮结束前下发） */
export interface ResearchSourcesChunk {
  type: 'sources';
  sources: Array<{ title: string; url: string }>;
}

export type StreamChunk =
  | {
      type: 'content' | 'tool_call_delta' | 'usage' | 'error' | 'done';
      delta?: string;
      toolCall?: ToolCall;
      toolCallDelta?: { id?: string; name?: string; arguments?: string };
      usage?: TokenUsage;
      error?: { code: string; message: string; recoverable: boolean };
    }
  | { type: 'tool_call_start'; toolCall?: ToolCall }
  | ResearchStageChunk
  | ResearchSourcesChunk;

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextLength: number;
  supportsFunctionCalling: boolean;
  supportsVision: boolean;
}

export interface LLMGatewayConfig {
  providers: LLMProvider[];
  defaultModel: string;
  defaultProvider?: string;
  /** 可选的动态模型解析器，用于从数据库加载 Provider 与模型配置 */
  resolveProvider?: (
    model: string,
    tenantId?: string,
  ) => Promise<{ provider: LLMProvider; model: string } | null>;
  maxConcurrent?: number;
  maxQueued?: number;
  queueTimeoutMs?: number;
}

export interface LLMGateway {
  chat(params: ChatParams): Promise<ChatResult>;
  chatStream(params: ChatParams): AsyncIterable<StreamChunk>;
  getProvider(name: string): LLMProvider | undefined;
  getDefaultProvider(): LLMProvider;
  listProviders(): LLMProvider[];
}

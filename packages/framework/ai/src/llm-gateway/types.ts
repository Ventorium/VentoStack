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

/**
 * Agent 运行模式（审批策略），按消息粒度下发：
 * - ask：高风险工具挂起等人工确认（默认）
 * - auto：由审批子智能体判定放行/拒绝
 * - trust：跳过审批直接执行
 * 注意：riskLevel 为 critical 的工具无视该模式，始终走人工审批。
 */
export type RunMode = 'ask' | 'auto' | 'trust';

export const RUN_MODES: readonly RunMode[] = ['ask', 'auto', 'trust'] as const;

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
  /** 模型推理/思考内容（reasoning_content），与正文分离 */
  reasoning?: string;
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

/** 工具执行结束 chunk（下发到 SSE 流，前端据此实时收敛工具状态与真实耗时） */
export interface ToolResultChunk {
  type: 'tool_result';
  toolCallId: string;
  toolName: string;
  durationMs: number;
  isError: boolean;
  /** 工具输出摘要（截断至 2000 字符），供前端展开查看 */
  output?: string;
  /** 审批放行方式：非人工审批时标注出来，让用户当场可见（auto=子智能体放行，trust=信任模式跳过） */
  approval?: { mode: 'auto' | 'trust'; reason?: string };
}

export type StreamChunk =
  | {
      type: 'content' | 'reasoning' | 'tool_call_delta' | 'usage' | 'error' | 'done';
      delta?: string;
      toolCall?: ToolCall;
      toolCallDelta?: { id?: string; name?: string; arguments?: string };
      usage?: TokenUsage;
      error?: { code: string; message: string; recoverable: boolean };
    }
  | { type: 'tool_call_start'; toolCall?: ToolCall }
  | ResearchStageChunk
  | ResearchSourcesChunk
  | { type: 'session'; sessionId: string }
  | { type: 'title'; title: string }
  | {
      type: 'approval_required';
      approval: {
        id: string;
        toolName: string;
        input: Record<string, unknown>;
        expiresAt: string;
        riskLevel?: 'low' | 'medium' | 'high' | 'critical';
        /** 对应的工具调用 ID：前端把审批状态标在同一个工具行上 */
        toolCallId?: string;
      };
    }
  /**
   * 审批结论 chunk：审批通过/被拒/超时过期时下发，让前端弹窗立即收敛
   * （否则超时后前端状态永远停在 pending，弹窗关不掉）。
   */
  | {
      type: 'approval_resolved';
      approvalId: string;
      status: 'approved' | 'rejected' | 'expired';
      reason?: string;
    }
  | ToolResultChunk;

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

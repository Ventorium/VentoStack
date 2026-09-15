/** AI 聊天模块类型定义 */

export interface Thread {
  id: string;
  title: string;
  lastMessage: string;
  updatedAt: string;
  agentName?: string;
  unread?: number;
}

export interface AgentStep {
  id: string;
  type: 'thinking' | 'skill' | 'bash' | 'tool' | 'error';
  name: string;
  description: string;
  /** 耗时（毫秒）；历史回放的工具块无计时数据时缺省，隐藏耗时标签 */
  durationMs?: number;
  status: 'running' | 'completed' | 'error';
}

/** 消息内容块：assistant 消息按流式到达顺序交错排列的文本段与工具调用块 */
export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolBlock {
  type: 'tool';
  id: string;
  name: string;
  status: 'running' | 'completed' | 'error';
  durationMs?: number;
  /** 工具调用参数（pretty JSON，点击工具行展开查看） */
  arguments?: string;
  /** 工具输出摘要（后端截断，点击工具行展开查看） */
  output?: string;
  /** 非人工放行来源（auto=审批子智能体放行，trust=信任模式跳过审批） */
  approval?: { mode: 'auto' | 'trust'; reason?: string };
}

export type MessageBlock = TextBlock | ToolBlock;

/** 深度研究阶段 */
export type ResearchStage = 'planning' | 'researching' | 'synthesizing';

export interface ResearchSource {
  title: string;
  url: string;
}

/** 工具审批请求（高风险工具需用户在聊天内确认后才能继续执行） */
export interface ChatApproval {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  expiresAt: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  /** 工具风险等级：critical 工具任何运行模式都会走到人工审批 */
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  /** 按流式到达顺序交错的内容块（存在时优先于 steps + content 的固定布局渲染） */
  blocks?: MessageBlock[];
  steps?: AgentStep[];
  /** 深度研究阶段进度 */
  researchStages?: ResearchStage[];
  /** 引用来源清单 */
  sources?: ResearchSource[];
  /** 工具审批请求（当前消息流中待确认/已确认的工具审批） */
  approval?: ChatApproval;
  /** 模型推理/思考内容（reasoning），与正文分离展示 */
  thinking?: string;
  model?: string;
  tokensUsed?: { input: number; output: number };
  isStreaming?: boolean;
}

/** 模型推理选项（与 ai_model.reasoning_options 兼容） */
export interface ModelReasoningOption {
  type: 'toggle' | 'effort' | 'budget_tokens';
  values?: string[];
  min?: number;
  max?: number;
}

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  supportsImage: boolean;
  supportsThinking?: boolean;
  reasoningOptions?: ModelReasoningOption[] | null;
}

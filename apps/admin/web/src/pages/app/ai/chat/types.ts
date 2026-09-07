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
  type: "thinking" | "skill" | "bash" | "tool" | "error";
  name: string;
  description: string;
  durationMs: number;
  status: "running" | "completed" | "error";
}

/** 深度研究阶段 */
export type ResearchStage = "planning" | "researching" | "synthesizing";

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
  status: "pending" | "approved" | "rejected" | "expired";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  steps?: AgentStep[];
  /** 深度研究阶段进度 */
  researchStages?: ResearchStage[];
  /** 引用来源清单 */
  sources?: ResearchSource[];
  /** 工具审批请求（当前消息流中待确认/已确认的工具审批） */
  approval?: ChatApproval;
  model?: string;
  tokensUsed?: { input: number; output: number };
  isStreaming?: boolean;
}

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
}

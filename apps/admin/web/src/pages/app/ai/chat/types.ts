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

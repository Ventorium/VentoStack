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

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  steps?: AgentStep[];
  model?: string;
  tokensUsed?: { input: number; output: number };
  isStreaming?: boolean;
}

export interface SkillCapability {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  readonly?: boolean;
}

export interface Skill {
  id: string;
  name: string;
  icon: string;
  color?: string;
  description: string;
  enabledCount: number;
  totalCount: number;
  capabilities: SkillCapability[];
}

export interface BottomTab {
  key: string;
  label: string;
  icon: string;
  count?: number;
}

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
}

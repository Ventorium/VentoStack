/**
 * 上下文洞察详情的响应结构
 *
 * 后端 `GET /api/ai/context/sessions/:sessionId` 的返回形状。
 * 抽到独立文件：面板组件只保留渲染逻辑，字段契约集中一处便于与后端对齐
 * （后续由 OpenAPI 生成类型替代，见 §17 前端类型规则）。
 */
export interface ContextDetailSession {
  /** 空详情（无记录）时后端返回 id 为空串，真实会话必有 UUID，据此区分空态 */
  id?: string;
  sessionId?: string;
  title?: string;
  model?: string;
  provider?: string;
  status?: string;
  durationMs?: number;
  /** provider 声明的上下文窗口（token）；未知为 null */
  contextWindow?: number | null;
  /** 多轮对话由多个 run 组成，runCount 是会话内 run 数 */
  runCount?: number;
  startedAt?: string;
  endedAt?: string | null;
  counts?: Record<string, number>;
  usage?: Record<string, number>;
  current?: Record<string, number>;
}

export interface ContextDetailRequest {
  id: string;
  seq: number;
  turnIndex?: number;
  composition?: Record<string, number>;
  actual?: {
    uncachedInputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  } | null;
  durationMs?: number;
  createdAt?: string;
}

export interface ContextDetailEvent {
  id: string;
  seq: number;
  kind?: string;
  producer?: string;
  deltaTokens?: number;
  turnIndex?: number;
  createdAt?: string;
}

export interface ContextDetailNode {
  id: string;
  seq: number;
  category?: string;
  name?: string;
  tokens?: number;
  preview?: string;
  /** 完整内容（最长 2 万字符），展开行展示；系统提示 / 用户消息全文在这里 */
  content?: string | null;
  goneAtSeq?: number;
}

export interface ContextDetailFileOp {
  id: string;
  seq: number;
  path?: string;
  kind?: string;
  tool?: string;
  err?: boolean;
  added?: number;
  removed?: number;
  createdAt?: string;
}

export interface ContextDetail {
  session?: ContextDetailSession;
  requests?: ContextDetailRequest[];
  events?: ContextDetailEvent[];
  nodes?: ContextDetailNode[];
  archive?: ContextDetailNode[];
  fileOps?: ContextDetailFileOp[];
}

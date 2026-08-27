/**
 * @ventostack/ai-trace — 运行缓冲（recorder 的内存状态单元）
 *
 * 每个 runId 对应一个 RunBuffer：seq 自增、轮次、usage 累计、
 * 打开中的 span 句柄、以及增量消息队列（见 recorder 的增量策略说明）。
 */

import type { AgentEventMessage } from "@ventostack/ai";

/** 打开中 span 的句柄（span 落库后的回写定位信息） */
export interface OpenSpan {
  id: string;
  seq: number;
  turnIndex: number;
  name: string;
  startedAt: number;
}

/** 每 run 的内存缓冲 */
export interface RunBuffer {
  traceId: string;
  tenantId: string;
  conversationId: string;
  skipped: boolean;
  seq: number;
  turnIndex: number;
  startedAt: number;
  usage: { promptTokens: number; completionTokens: number };
  toolCount: number;
  turnCount: number;
  /** 自上一轮 LLM 调用以来新增的消息（作为下一轮 LLM span 的增量输入） */
  pendingMessages: AgentEventMessage[];
  /** 当前打开的 LLM span */
  openLlm: OpenSpan | null;
  /** 打开中的工具 span（按 toolCallId） */
  openTools: Map<string, OpenSpan>;
  finalAssistantContent: string;
}

/** 创建运行缓冲（traceId = runId） */
export function createRunBuffer(params: {
  traceId: string;
  tenantId: string;
  conversationId: string;
  skipped: boolean;
}): RunBuffer {
  return {
    traceId: params.traceId,
    tenantId: params.tenantId,
    conversationId: params.conversationId,
    skipped: params.skipped,
    seq: 0,
    turnIndex: 0,
    startedAt: Date.now(),
    usage: { promptTokens: 0, completionTokens: 0 },
    toolCount: 0,
    turnCount: 0,
    pendingMessages: [],
    openLlm: null,
    openTools: new Map(),
    finalAssistantContent: "",
  };
}

/** 分配 run 内全局自增序号 */
export function nextSeq(buffer: RunBuffer): number {
  buffer.seq += 1;
  return buffer.seq;
}

/** 生成 span 主键 */
export function newSpanId(): string {
  return crypto.randomUUID();
}

/** 工具名 → 分类 */
export function categorizeTool(toolName: string): "knowledge_base" | "mcp" | "builtin" {
  if (toolName.startsWith("kb-")) return "knowledge_base";
  if (toolName.startsWith("mcp_")) return "mcp";
  return "builtin";
}

/** 从 mcp_{server}_{tool} 中解析 server 名（解析失败返回 null） */
export function parseMcpServerName(toolName: string): string | null {
  if (!toolName.startsWith("mcp_")) return null;
  const rest = toolName.slice("mcp_".length);
  const idx = rest.indexOf("_");
  return idx > 0 ? rest.slice(0, idx) : null;
}

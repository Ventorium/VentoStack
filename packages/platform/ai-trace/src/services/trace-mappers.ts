/**
 * @ventostack/ai-trace — 落库 payload 处理与行映射（纯函数）
 *
 * truncateJson / truncateString / toDbJson 供 store 写入前统一脱敏 + 截断；
 * toTraceRecord / toTraceSpan 负责 snake_case 行 → camelCase 记录映射。
 */

import { sanitize } from "@ventostack/observability";
import type { TraceRecord, TraceSpan, TraceStatus } from "../types";

/** 单字符串截断上限 */
const MAX_STRING_LENGTH = 8000;
/** JSON 嵌套深度上限 */
const MAX_DEPTH = 6;

export type RawRow = Record<string, unknown>;

/** 递归截断 JSON 中的超长字符串与超深嵌套（纯函数，供单测） */
export function truncateJson(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[深度截断]";
  if (typeof value === "string") return truncateString(value);
  if (Array.isArray(value)) return value.map((item) => truncateJson(item, depth + 1));
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = truncateJson(item, depth + 1);
    }
    return result;
  }
  return value;
}

/** 截断单个字符串（保持 string 类型，供 error 等纯文本列使用） */
export function truncateString(value: string): string {
  return value.length > MAX_STRING_LENGTH
    ? `${value.slice(0, MAX_STRING_LENGTH)}...[截断]`
    : value;
}

/** 落库前统一处理：脱敏（敏感 key）→ 截断（长度/深度）→ JSON 字符串 */
export function toDbJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(truncateJson(sanitize(value)));
}

/** trace 可更新列（camelCase → snake_case） */
export const TRACE_UPDATE_COLUMNS: Record<string, string> = {
  systemPrompt: "system_prompt",
  assistantPreview: "assistant_preview",
  status: "status",
  usage: "usage",
  error: "error",
  turnCount: "turn_count",
  toolCount: "tool_count",
  durationMs: "duration_ms",
  endedAt: "ended_at",
};

/** trace 查询列清单 */
export const TRACE_COLUMNS = `id, conversation_id, agent_id, session_id, user_id, tenant_id, status,
  user_message, assistant_preview, system_prompt, model, meta, usage, error, turn_count, tool_count,
  duration_ms, started_at, ended_at`;

function toDate(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value ?? "");
}

function toNullableDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return value === null || value === undefined ? null : String(value);
}

function toNullableMs(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

/** 行 → TraceRecord（snake_case → camelCase） */
export function toTraceRecord(row: RawRow): TraceRecord {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id ?? ""),
    agentId: (row.agent_id as string) ?? null,
    sessionId: (row.session_id as string) ?? null,
    userId: String(row.user_id ?? ""),
    tenantId: String(row.tenant_id ?? ""),
    status: (row.status as TraceStatus) ?? "running",
    userMessage: (row.user_message as string) ?? null,
    assistantPreview: (row.assistant_preview as string) ?? null,
    systemPrompt: (row.system_prompt as string) ?? null,
    model: (row.model as string) ?? null,
    meta: (row.meta as TraceRecord["meta"]) ?? null,
    usage: (row.usage as TraceRecord["usage"]) ?? null,
    error: (row.error as string) ?? null,
    turnCount: Number(row.turn_count ?? 0),
    toolCount: Number(row.tool_count ?? 0),
    durationMs: toNullableMs(row.duration_ms),
    startedAt: toDate(row.started_at),
    endedAt: toNullableDate(row.ended_at),
  };
}

/** 行 → TraceSpan */
export function toTraceSpan(row: RawRow): TraceSpan {
  return {
    id: String(row.id),
    traceId: String(row.trace_id ?? ""),
    tenantId: String(row.tenant_id ?? ""),
    seq: Number(row.seq ?? 0),
    turnIndex: Number(row.turn_index ?? 0),
    spanType: (row.span_type as TraceSpan["spanType"]) ?? "llm",
    name: String(row.name ?? ""),
    category: (row.category as TraceSpan["category"]) ?? "builtin",
    status: (row.status as TraceStatus) ?? "running",
    input: (row.input as TraceSpan["input"]) ?? null,
    output: (row.output as TraceSpan["output"]) ?? null,
    error: (row.error as string) ?? null,
    startedAt: toDate(row.started_at),
    endedAt: toNullableDate(row.ended_at),
    durationMs: toNullableMs(row.duration_ms),
  };
}

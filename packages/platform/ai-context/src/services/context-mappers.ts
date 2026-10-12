/**
 * @ventostack/ai-context — 行映射
 *
 * 数据库 snake_case → 领域 camelCase；写入方向做反序列化 + 截断保护。
 */

import type {
  ActivityDay,
  ContextEventRecord,
  ContextOverview,
  ContextSession,
  ContextSessionStatus,
  RequestBrief,
  RequestRecord,
  SurfaceNode,
  ActualUsage,
  Composition,
} from "../shared/types";

export type RawRow = Record<string, unknown>;

/** 单条内容最大存储长度（超出截断，避免上下文正文撑爆数据库） */
export const MAX_CONTENT_LENGTH = 20_000;
export const MAX_PREVIEW_LENGTH = 500;

export function num(row: RawRow, key: string): number {
  const v = row[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  // Bun SQL 驱动把 int8(bigint) 以字符串返回（避免超出 JS 安全整数范围丢精度），
  // 若只认 number，usage_*/duration_ms/SUM(...)::bigint 会被静默读成 0。
  if (typeof v === "string") {
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function str(row: RawRow, key: string): string | null {
  const v = row[key];
  return typeof v === "string" ? v : null;
}

/**
 * 时间戳列映射：Bun SQL 把 timestamp 列解码为 Date，而不是字符串。
 * 统一收敛为 ISO 字符串（前端再按本地时区格式化），避免时间字段静默变成 null。
 */
export function ts(row: RawRow, key: string): string | null {
  const v = row[key];
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof v === "string" && v !== "") return v;
  return null;
}

export function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…[truncated]` : text;
}

export function toDbJson(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export function parseComposition(row: RawRow, prefix = "comp_"): Composition {
  return {
    system: num(row, `${prefix}system`),
    tools: num(row, `${prefix}tools`),
    user: num(row, `${prefix}user`),
    inject: num(row, `${prefix}inject`),
    skill: num(row, `${prefix}skill`),
    assistant: num(row, `${prefix}assistant`),
    tool: num(row, `${prefix}tool`),
    total: num(row, `${prefix}total`),
  };
}

export function toContextSession(row: RawRow): ContextSession {
  return {
    id: str(row, "id") ?? "",
    tenantId: str(row, "tenant_id") ?? "",
    sessionId: str(row, "session_id") ?? "",
    title: str(row, "title"),
    agentId: str(row, "agent_id"),
    agentName: str(row, "agent_name"),
    userId: str(row, "user_id"),
    userName: str(row, "user_name"),
    parentRunId: str(row, "parent_run_id"),
    runCount: num(row, "run_count"),
    model: str(row, "model"),
    provider: str(row, "provider"),
    contextWindow: row.context_window === null ? null : num(row, "context_window"),
    status: (str(row, "status") ?? "running") as ContextSessionStatus,
    counts: {
      turns: num(row, "turn_count"),
      steps: num(row, "step_count"),
      injects: num(row, "inject_count"),
      compactions: num(row, "compact_count"),
      prunes: num(row, "prune_count"),
      skills: num(row, "skill_count"),
      humanInputs: num(row, "human_input_count"),
      answers: num(row, "answer_count"),
    },
    current: parseComposition(row, "current_"),
    usage: {
      uncached: num(row, "usage_uncached"),
      cacheRead: num(row, "usage_cache_read"),
      cacheWrite: num(row, "usage_cache_write"),
      output: num(row, "usage_output"),
    },
    durationMs: num(row, "duration_ms"),
    lastUser: str(row, "last_user"),
    startedAt: ts(row, "started_at") ?? "",
    endedAt: ts(row, "ended_at"),
  };
}

export function toRequestRecord(row: RawRow): RequestRecord {
  return {
    id: str(row, "id") ?? "",
    sessionId: str(row, "session_id") ?? "",
    seq: num(row, "seq"),
    turnIndex: num(row, "turn_index"),
    model: str(row, "model"),
    provider: str(row, "provider"),
    messageCount: num(row, "message_count"),
    contextWindow: row.context_window === null ? null : num(row, "context_window"),
    composition: parseComposition(row),
    actual:
      row.act_uncached === null && row.act_output === null
        ? null
        : ({
            uncachedInputTokens: num(row, "act_uncached"),
            outputTokens: num(row, "act_output"),
            cacheReadTokens: num(row, "act_cache_read"),
            cacheWriteTokens: num(row, "act_cache_write"),
          } satisfies ActualUsage),
    durationMs: row.duration_ms === null ? null : num(row, "duration_ms"),
    brief: parseBrief(row.brief),
    createdAt: ts(row, "created_at") ?? "",
  };
}

function parseBrief(value: unknown): RequestBrief | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as Partial<RequestBrief>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      user: typeof parsed.user === "string" ? parsed.user : "",
      incoming: Array.isArray(parsed.incoming)
        ? parsed.incoming.filter((x): x is string => typeof x === "string")
        : [],
      response: typeof parsed.response === "string" ? parsed.response : "",
    };
  } catch {
    return null;
  }
}

export function toContextEvent(row: RawRow): ContextEventRecord {
  let detail: Record<string, unknown> | null = null;
  if (typeof row.detail === "string") {
    try {
      const parsed: unknown = JSON.parse(row.detail);
      if (parsed && typeof parsed === "object") detail = parsed as Record<string, unknown>;
    } catch {
      detail = null;
    }
  }
  return {
    id: str(row, "id") ?? "",
    sessionId: str(row, "session_id") ?? "",
    seq: num(row, "seq"),
    kind: str(row, "kind") as ContextEventRecord["kind"] ?? "inject",
    producer: str(row, "producer") ?? "",
    deltaTokens: num(row, "delta_tokens"),
    turnIndex: num(row, "turn_index"),
    detail,
    createdAt: ts(row, "created_at") ?? "",
  };
}

export function toSurfaceNode(row: RawRow): SurfaceNode {
  return {
    id: str(row, "id") ?? "",
    sessionId: str(row, "session_id") ?? "",
    seq: num(row, "seq"),
    category: str(row, "category") as SurfaceNode["category"] ?? "inject",
    name: str(row, "name") ?? "",
    tokens: num(row, "tokens"),
    preview: str(row, "preview") ?? "",
    content: str(row, "content"),
    images: num(row, "images"),
    goneAtSeq: row.gone_at_seq === null || row.gone_at_seq === undefined ? null : num(row, "gone_at_seq"),
    createdAt: ts(row, "created_at") ?? "",
  };
}

export function toActivityDay(day: string, tokens: number, requests: number, cost: number | null): ActivityDay {
  return { day, tokens, requests, cost };
}

export function emptyOverview(): ContextOverview {
  return {
    sessionCount: 0,
    requestCount: 0,
    billedTokens: 0,
    estimatedCost: null,
    cacheHitRate: null,
    days: [],
    composition: {
      system: 0,
      tools: 0,
      user: 0,
      inject: 0,
      skill: 0,
      assistant: 0,
      tool: 0,
      total: 0,
    },
  };
}
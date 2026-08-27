/**
 * @ventostack/ai-trace — 链路落库与查询服务
 *
 * 负责 ai_trace / ai_trace_span 的写入（供 recorder 调用）与租户隔离查询（供路由调用）。
 * 写入 payload 先经 sanitize 脱敏 + truncateJson 截断（见 trace-mappers）；
 * 会话级只读查询见 trace-queries。
 */

import type { Database } from "@ventostack/database";
import type {
  TraceConversationItem,
  TraceDetail,
  TraceMessageItem,
  TraceRecord,
  TraceSpan,
  TraceStatus,
  TraceTokenUsage,
} from "../types";
import { TRACE_COLUMNS, TRACE_UPDATE_COLUMNS, toDbJson, toTraceRecord, toTraceSpan, truncateString } from "./trace-mappers";
import type { RawRow } from "./trace-mappers";
import { createTraceQueries } from "./trace-queries";
import type { PaginatedResult, TraceConversationListParams } from "./trace-queries";

/** trace 行更新字段（camelCase → SQL 映射在内部处理） */
export interface TraceUpdateFields {
  systemPrompt?: string | null;
  assistantPreview?: string | null;
  status?: TraceStatus;
  usage?: TraceTokenUsage | null;
  error?: string | null;
  turnCount?: number;
  toolCount?: number;
  durationMs?: number | null;
  endedAt?: Date | null;
  appendToolNames?: string[];
}

/** span 关闭时的更新字段 */
export interface SpanUpdateFields {
  status?: TraceStatus;
  name?: string;
  output?: Record<string, unknown> | null;
  error?: string | null;
  endedAt?: Date | null;
  durationMs?: number | null;
}

/** 链路存储服务接口 */
export interface TraceStore {
  insertTrace(record: TraceRecord): Promise<void>;
  updateTrace(id: string, tenantId: string, fields: TraceUpdateFields): Promise<void>;
  insertSpan(span: TraceSpan): Promise<void>;
  updateSpan(id: string, tenantId: string, fields: SpanUpdateFields): Promise<void>;
  getTrace(id: string, tenantId: string): Promise<TraceRecord | null>;
  getTraceDetail(id: string, tenantId: string): Promise<TraceDetail | null>;
  listConversations(params: TraceConversationListParams): Promise<PaginatedResult<TraceConversationItem>>;
  listConversationMessages(conversationId: string, tenantId: string, limit?: number): Promise<TraceMessageItem[]>;
  markStaleTraces(olderThanMs: number): Promise<number>;
}

export function createTraceStore(deps: { db: Database }): TraceStore {
  const { db } = deps;
  const queries = createTraceQueries(db);

  async function insertTrace(record: TraceRecord): Promise<void> {
    await db.raw(
      `INSERT INTO ai_trace
        (id, conversation_id, agent_id, session_id, user_id, tenant_id, status,
         user_message, assistant_preview, system_prompt, model, meta, usage, error,
         turn_count, tool_count, duration_ms, started_at, ended_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
      [
        record.id,
        record.conversationId,
        record.agentId,
        record.sessionId,
        record.userId,
        record.tenantId,
        record.status,
        record.userMessage,
        record.assistantPreview,
        record.systemPrompt,
        record.model,
        toDbJson(record.meta),
        toDbJson(record.usage),
        record.error,
        record.turnCount,
        record.toolCount,
        record.durationMs,
        record.startedAt ? new Date(record.startedAt) : new Date(),
        record.endedAt ? new Date(record.endedAt) : null,
      ],
    );
  }

  async function updateTrace(id: string, tenantId: string, fields: TraceUpdateFields): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [id, tenantId];
    let idx = 3;

    for (const [key, column] of Object.entries(TRACE_UPDATE_COLUMNS)) {
      const value = (fields as Record<string, unknown>)[key];
      if (value === undefined) continue;
      if (key === "usage") {
        sets.push(`${column} = $${idx++}`);
        params.push(toDbJson(value));
      } else if (key === "error") {
        sets.push(`${column} = $${idx++}`);
        params.push(value === null ? null : truncateString(String(value)));
      } else if (key === "endedAt") {
        sets.push(`${column} = $${idx++}`);
        params.push(value === null ? null : (value as Date));
      } else {
        sets.push(`${column} = $${idx++}`);
        params.push(value);
      }
    }

    // 动态工具追加：merge 进现有 meta.toolNames
    if (fields.appendToolNames && fields.appendToolNames.length > 0) {
      const merged = toDbJson(fields.appendToolNames);
      if (merged) {
        sets.push(`meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '{toolNames}', $${idx++})`);
        params.push(merged);
      }
    }

    if (sets.length === 0) return;
    await db.raw(
      `UPDATE ai_trace SET ${sets.join(", ")} WHERE id = $1 AND tenant_id = $2`,
      params,
    );
  }

  async function insertSpan(span: TraceSpan): Promise<void> {
    await db.raw(
      `INSERT INTO ai_trace_span
        (id, trace_id, tenant_id, seq, turn_index, span_type, name, category,
         status, input, output, error, started_at, ended_at, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        span.id,
        span.traceId,
        span.tenantId,
        span.seq,
        span.turnIndex,
        span.spanType,
        span.name,
        span.category,
        span.status,
        toDbJson(span.input),
        toDbJson(span.output),
        span.error === null ? null : truncateString(span.error),
        span.startedAt ? new Date(span.startedAt) : new Date(),
        span.endedAt ? new Date(span.endedAt) : null,
        span.durationMs,
      ],
    );
  }

  /** span 关闭：按主键 UPDATE（开启时已 insert，保持同主键） */
  async function updateSpan(id: string, tenantId: string, fields: SpanUpdateFields): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [id, tenantId];
    let idx = 3;
    if (fields.status !== undefined) {
      sets.push(`status = $${idx++}`);
      params.push(fields.status);
    }
    if (fields.name !== undefined) {
      sets.push(`name = $${idx++}`);
      params.push(fields.name);
    }
    if (fields.output !== undefined) {
      sets.push(`output = $${idx++}`);
      params.push(fields.output === null ? null : toDbJson(fields.output));
    }
    if (fields.error !== undefined) {
      sets.push(`error = $${idx++}`);
      params.push(fields.error === null ? null : truncateString(fields.error));
    }
    if (fields.endedAt !== undefined) {
      sets.push(`ended_at = $${idx++}`);
      params.push(fields.endedAt);
    }
    if (fields.durationMs !== undefined) {
      sets.push(`duration_ms = $${idx++}`);
      params.push(fields.durationMs);
    }
    if (sets.length === 0) return;
    await db.raw(
      `UPDATE ai_trace_span SET ${sets.join(", ")} WHERE id = $1 AND tenant_id = $2`,
      params,
    );
  }

  async function getTrace(id: string, tenantId: string): Promise<TraceRecord | null> {
    const rows = (await db.raw(
      `SELECT ${TRACE_COLUMNS} FROM ai_trace WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    )) as RawRow[];
    return rows[0] ? toTraceRecord(rows[0]) : null;
  }

  async function getTraceDetail(id: string, tenantId: string): Promise<TraceDetail | null> {
    const trace = await getTrace(id, tenantId);
    if (!trace) return null;
    const spanRows = (await db.raw(
      `SELECT id, trace_id, tenant_id, seq, turn_index, span_type, name, category,
        status, input, output, error, started_at, ended_at, duration_ms
       FROM ai_trace_span WHERE trace_id = $1 AND tenant_id = $2 ORDER BY seq ASC`,
      [id, tenantId],
    )) as RawRow[];
    return { trace, spans: spanRows.map(toTraceSpan) };
  }

  /** 陈旧兜底：中断超时 running 追踪，并同步关闭其残留 running span */
  async function markStaleTraces(olderThanMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMs);
    const rows = (await db.raw(
      `UPDATE ai_trace SET status = 'interrupted', ended_at = NOW()
       WHERE status = 'running' AND started_at < $1
       RETURNING id`,
      [cutoff],
    )) as RawRow[];
    if (rows.length > 0) {
      const traceIds = rows.map((row) => String(row.id));
      const placeholders = traceIds.map((_, i) => `$${i + 1}`).join(", ");
      await db.raw(
        `UPDATE ai_trace_span SET status = 'interrupted', ended_at = NOW()
         WHERE status = 'running' AND trace_id IN (${placeholders})`,
        traceIds,
      );
    }
    return rows.length;
  }

  return {
    insertTrace,
    updateTrace,
    insertSpan,
    updateSpan,
    getTrace,
    getTraceDetail,
    listConversations: queries.listConversations,
    listConversationMessages: queries.listConversationMessages,
    markStaleTraces,
  };
}

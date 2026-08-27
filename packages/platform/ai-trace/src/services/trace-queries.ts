/**
 * @ventostack/ai-trace — 追踪查询（会话聚合列表 / 会话消息时间线）
 *
 * 从 trace-store 拆出的只读查询：全部强制 tenant_id 条件，
 * 会话标题等补充信息来自 ai_conversation（带租户过滤）。
 */

import type { Database } from "@ventostack/database";
import type { TraceConversationItem, TraceMessageItem, TraceStatus, TraceTokenUsage } from "../types";
import type { RawRow } from "./trace-mappers";

/** 分页结果 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 会话列表查询参数 */
export interface TraceConversationListParams {
  tenantId: string;
  agentId?: string;
  userId?: string;
  keyword?: string;
  startTime?: string;
  endTime?: string;
  page?: number;
  pageSize?: number;
}

/** 关键词长度上限（防御超长 LIKE 模式） */
const KEYWORD_MAX_LENGTH = 100;
/** 消息时间线单次上限 */
const MESSAGE_LIMIT_MAX = 200;

export function createTraceQueries(db: Database) {
  async function listConversations(
    params: TraceConversationListParams,
  ): Promise<PaginatedResult<TraceConversationItem>> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));

    const conditions: string[] = ["t.tenant_id = $1"];
    const values: unknown[] = [params.tenantId];
    let idx = 2;
    if (params.agentId) {
      conditions.push(`t.agent_id = $${idx++}`);
      values.push(params.agentId);
    }
    if (params.userId) {
      conditions.push(`t.user_id = $${idx++}`);
      values.push(params.userId);
    }
    if (params.startTime) {
      conditions.push(`t.started_at >= $${idx++}`);
      values.push(new Date(params.startTime));
    }
    if (params.endTime) {
      conditions.push(`t.started_at <= $${idx++}`);
      values.push(new Date(params.endTime));
    }
    if (params.keyword) {
      const keyword = params.keyword.slice(0, KEYWORD_MAX_LENGTH);
      conditions.push(`(t.user_message ILIKE $${idx} OR t.conversation_id::text ILIKE $${idx})`);
      values.push(`%${keyword}%`);
      idx++;
    }
    const where = `WHERE ${conditions.join(" AND ")}`;

    const countRows = (await db.raw(
      `SELECT COUNT(DISTINCT t.conversation_id) AS cnt FROM ai_trace t ${where}`,
      values,
    )) as RawRow[];
    const total = Number(countRows[0]?.cnt ?? 0);

    const rows = (await db.raw(
      `SELECT t.conversation_id AS id,
              MAX(t.agent_id) AS agent_id,
              MAX(t.user_id) AS user_id,
              MAX(t.tenant_id) AS tenant_id,
              COUNT(*) AS trace_count,
              MAX(t.turn_count) AS max_turns,
              SUM(COALESCE((t.usage->>'totalTokens')::int, 0)) AS total_tokens,
              MAX(t.started_at) AS last_trace_at
       FROM ai_trace t ${where}
       GROUP BY t.conversation_id
       ORDER BY last_trace_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, pageSize, (page - 1) * pageSize],
    )) as RawRow[];

    // 会话标题/消息数来自 ai_conversation（带租户过滤；无记录时回退 trace 侧数据）
    const convIds = rows.map((row) => String(row.id));
    const convMap = new Map<string, { title: string | null; messageCount: number }>();
    if (convIds.length > 0) {
      const placeholders = convIds.map((_, i) => `$${i + 1}`).join(", ");
      const convRows = (await db.raw(
        `SELECT id, title, message_count FROM ai_conversation
         WHERE id IN (${placeholders}) AND tenant_id = $${convIds.length + 1}`,
        [...convIds, params.tenantId],
      )) as RawRow[];
      for (const row of convRows) {
        convMap.set(String(row.id), {
          title: (row.title as string) ?? null,
          messageCount: Number(row.message_count ?? 0),
        });
      }
    }

    const items: TraceConversationItem[] = rows.map((row) => {
      const conv = convMap.get(String(row.id));
      return {
        id: String(row.id),
        title: conv?.title ?? null,
        agentId: (row.agent_id as string) ?? null,
        userId: (row.user_id as string) ?? null,
        tenantId: String(row.tenant_id ?? params.tenantId),
        messageCount: conv?.messageCount ?? 0,
        traceCount: Number(row.trace_count ?? 0),
        totalTokens: Number(row.total_tokens ?? 0),
        lastTraceAt:
          row.last_trace_at instanceof Date ? row.last_trace_at.toISOString() : String(row.last_trace_at ?? ""),
        createdAt: null,
      };
    });

    return { items, total, page, pageSize };
  }

  async function listConversationMessages(
    conversationId: string,
    tenantId: string,
    limit = 100,
  ): Promise<TraceMessageItem[]> {
    // 取最近 N 条（DESC）后反转回时间正序
    const rows = (await db.raw(
      `SELECT id, user_message, assistant_preview, status, model, turn_count, tool_count, usage, duration_ms, started_at
       FROM ai_trace
       WHERE conversation_id = $1 AND tenant_id = $2
       ORDER BY started_at DESC
       LIMIT $3`,
      [conversationId, tenantId, Math.min(MESSAGE_LIMIT_MAX, Math.max(1, limit))],
    )) as RawRow[];

    return rows
      .map((row) => {
        const usage = row.usage as TraceTokenUsage | null;
        return {
          traceId: String(row.id),
          userMessage: String(row.user_message ?? ""),
          assistantPreview: String(row.assistant_preview ?? ""),
          status: (row.status as TraceStatus) ?? "running",
          model: (row.model as string) ?? null,
          turnCount: Number(row.turn_count ?? 0),
          toolCount: Number(row.tool_count ?? 0),
          usage: usage ?? null,
          durationMs: row.duration_ms === null || row.duration_ms === undefined ? null : Number(row.duration_ms),
          startedAt: row.started_at instanceof Date ? row.started_at.toISOString() : String(row.started_at ?? ""),
        };
      })
      .reverse();
  }

  return { listConversations, listConversationMessages };
}

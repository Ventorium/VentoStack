/**
 * @ventostack/ai-context — 上下文存储（写）
 *
 * 供 recorder 落库折叠器的 WriteOp。所有写入强制携带 tenantId；
 * 会话不存在时先 upsert 建立，查询一律 WHERE tenant_id = ? （CLAUDE.md §16）。
 */

import type { Database } from "@ventostack/database";
import { MAX_CONTENT_LENGTH, MAX_PREVIEW_LENGTH, toDbJson, truncate } from "./context-mappers";
import type { RawRow } from "./context-mappers";
import type { ContextEventInsert, FileOpInsert, FoldNode, RequestInsert, SessionPatch, WriteOp } from "./fold-types";

export interface UpsertSessionInput {
  tenantId: string;
  sessionId: string;
  agentId?: string | null;
  userId?: string | null;
  parentRunId?: string | null;
  startedAt?: Date;
}

export interface ContextStore {
  upsertSession(input: UpsertSessionInput): Promise<void>;
  /** 批量落库折叠器的写操作（单次事务） */
  applyOps(tenantId: string, sessionId: string, ops: WriteOp[]): Promise<void>;
  /** 把会话标记为结束；durationMs 为该 run 耗时，累加进会话总耗时 */
  closeSession(tenantId: string, sessionId: string, status: string, durationMs?: number): Promise<void>;
  /** 清理崩溃遗留的 running 会话，返回清理条数 */
  markStaleSessions(olderThanMs: number): Promise<number>;
  /**
   * 会话当前已用到的最大 seq（跨 node/request/event/file_op 取最大）。
   * 多轮对话 = 同一 session 多个 run，每个 run 的 fold 必须从这里续起，
   * 否则确定性 ID（n-${seq}/r-${seq}/e-${seq}）与历史行冲突，
   * 且 getDetail 按 seq 重建时间线要求 seq 在 session 内全局唯一。
   */
  currentSeq(tenantId: string, sessionId: string): Promise<number>;
}

export function createContextStore(deps: { db: Database }): ContextStore {
  const { db } = deps;

  async function upsertSession(input: UpsertSessionInput): Promise<void> {
    const { tenantId, sessionId } = input;
    // 租户缺失直接拒绝，绝不退化为全局 upsert
    if (!tenantId || tenantId.trim() === "") {
      throw new Error("ai-context: tenantId 不能为空（租户隔离要求 fail-closed）");
    }
    await db.raw(
      `INSERT INTO ai_context_session
         (id, tenant_id, session_id, agent_id, user_id, parent_run_id, status, started_at, rev, run_count)
       VALUES ($1, $2, $3, $4, $5, $6, 'running', $7, 0, 1)
       ON CONFLICT (tenant_id, session_id) DO UPDATE SET
         agent_id = COALESCE(EXCLUDED.agent_id, ai_context_session.agent_id),
         user_id = COALESCE(EXCLUDED.user_id, ai_context_session.user_id),
         parent_run_id = COALESCE(EXCLUDED.parent_run_id, ai_context_session.parent_run_id),
         run_count = ai_context_session.run_count + 1,
         status = 'running',
         rev = ai_context_session.rev + 1`,
      [
        crypto.randomUUID(),
        tenantId,
        sessionId,
        input.agentId ?? null,
        input.userId ?? null,
        input.parentRunId ?? null,
        input.startedAt ?? new Date(),
      ],
    );
  }

  async function applyOps(tenantId: string, sessionId: string, ops: WriteOp[]): Promise<void> {
    // 租户校验必须在空列表短路之前：作用域边界是入口契约，不能因无操作而绕过
    if (!tenantId || tenantId.trim() === "") {
      throw new Error("ai-context: tenantId 不能为空（租户隔离要求 fail-closed）");
    }
    if (ops.length === 0) return;
    await db.transaction(async (tx) => {
      for (const op of ops) {
        switch (op.kind) {
          case "insertNode":
            await insertNode(tx, tenantId, sessionId, op.node);
            break;
          case "archiveNodes":
            await archiveNodes(tx, tenantId, sessionId, op.ids, op.goneAtSeq);
            break;
          case "insertRequest":
            await insertRequest(tx, tenantId, sessionId, op.request);
            break;
          case "patchRequest":
            await patchRequest(tx, tenantId, sessionId, op.id, op.actual, op.durationMs, op.brief);
            break;
          case "insertEvent":
            await insertEvent(tx, tenantId, sessionId, op.event);
            break;
          case "insertFileOp":
            await insertFileOp(tx, tenantId, sessionId, op.op);
            break;
          case "upsertSession":
            await patchSession(tx, tenantId, sessionId, op.patch);
            break;
        }
      }
    });
  }

  async function closeSession(
    tenantId: string,
    sessionId: string,
    status: string,
    durationMs?: number,
  ): Promise<void> {
    // 会话可能由多个 run 组成（多轮对话）：耗时累加，非法值一律按 0 处理
    const raw = durationMs ?? 0;
    const elapsed = Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
    await db.raw(
      `UPDATE ai_context_session
          SET status = $1, ended_at = NOW(), duration_ms = COALESCE(duration_ms, 0) + $4, rev = rev + 1
        WHERE tenant_id = $2 AND session_id = $3`,
      [status, tenantId, sessionId, elapsed],
    );
  }

  async function markStaleSessions(olderThanMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMs);
    const rows = (await db.raw(
      `UPDATE ai_context_session
          SET status = 'error', ended_at = NOW()
        WHERE status = 'running' AND started_at < $1
        RETURNING id`,
      [cutoff],
    )) as RawRow[];
    return rows.length;
  }

  async function currentSeq(tenantId: string, sessionId: string): Promise<number> {
    if (!tenantId || tenantId.trim() === "") {
      throw new Error("ai-context: tenantId 不能为空（租户隔离要求 fail-closed）");
    }
    const rows = (await db.raw(
      `SELECT GREATEST(
         COALESCE((SELECT MAX(seq) FROM ai_context_node     WHERE tenant_id = $1 AND session_id = $2), 0),
         COALESCE((SELECT MAX(seq) FROM ai_context_request  WHERE tenant_id = $1 AND session_id = $2), 0),
         COALESCE((SELECT MAX(seq) FROM ai_context_event    WHERE tenant_id = $1 AND session_id = $2), 0),
         COALESCE((SELECT MAX(seq) FROM ai_context_file_op  WHERE tenant_id = $1 AND session_id = $2), 0)
       ) AS max_seq`,
      [tenantId, sessionId],
    )) as Array<{ max_seq?: number | string | null }>;
    const v = rows?.[0]?.max_seq;
    const n = typeof v === "string" ? Number(v) : (v ?? 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  return { upsertSession, applyOps, closeSession, markStaleSessions, currentSeq };
}

// ---- 内部写操作（均在事务内，携带 tenantId + sessionId 双重限定）----

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function insertNode(tx: Tx, tenantId: string, sessionId: string, node: FoldNode): Promise<void> {
  await tx.raw(
    `INSERT INTO ai_context_node
       (id, tenant_id, session_id, seq, category, name, tokens, preview, content, images, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
    [
      node.id,
      tenantId,
      sessionId,
      node.seq,
      node.category,
      truncate(node.name, 256),
      node.tokens,
      truncate(node.preview, MAX_PREVIEW_LENGTH),
      node.content ? truncate(node.content, MAX_CONTENT_LENGTH) : null,
      node.images,
    ],
  );
}

async function archiveNodes(
  tx: Tx,
  tenantId: string,
  sessionId: string,
  ids: string[],
  goneAtSeq: number,
): Promise<void> {
  if (ids.length === 0) return;
  await tx.raw(
    `UPDATE ai_context_node
        SET gone_at_seq = $1
      WHERE tenant_id = $2 AND session_id = $3 AND gone_at_seq IS NULL AND id = ANY($4)`,
    [goneAtSeq, tenantId, sessionId, ids],
  );
}

async function insertRequest(tx: Tx, tenantId: string, sessionId: string, r: RequestInsert): Promise<void> {
  await tx.raw(
    `INSERT INTO ai_context_request
       (id, tenant_id, session_id, seq, turn_index, model, provider, message_count, context_window,
        comp_system, comp_tools, comp_user, comp_inject, comp_skill, comp_assistant, comp_tool, comp_total, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())`,
    [
      r.id,
      tenantId,
      sessionId,
      r.seq,
      r.turnIndex,
      r.model,
      r.provider,
      r.messageCount,
      r.contextWindow,
      r.system,
      r.tools,
      r.user,
      r.inject,
      r.skill,
      r.assistant,
      r.tool,
      r.total,
    ],
  );
}

async function patchRequest(
  tx: Tx,
  tenantId: string,
  sessionId: string,
  id: string,
  actual: { uncached: number; output: number; cacheRead: number; cacheWrite: number },
  durationMs: number,
  brief: { user: string; incoming: string[]; response: string },
): Promise<void> {
  await tx.raw(
    `UPDATE ai_context_request
        SET act_uncached = $1, act_output = $2, act_cache_read = $3, act_cache_write = $4,
            duration_ms = $5, brief = $6
      WHERE tenant_id = $7 AND session_id = $8 AND id = $9`,
    [
      actual.uncached,
      actual.output,
      actual.cacheRead,
      actual.cacheWrite,
      durationMs,
      toDbJson(brief),
      tenantId,
      sessionId,
      id,
    ],
  );
}

async function insertEvent(
  tx: Tx,
  tenantId: string,
  sessionId: string,
  e: ContextEventInsert,
): Promise<void> {
  await tx.raw(
    `INSERT INTO ai_context_event
       (id, tenant_id, session_id, seq, kind, producer, delta_tokens, turn_index, detail, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
    [
      e.id,
      tenantId,
      sessionId,
      e.seq,
      e.kind,
      truncate(e.producer, 128),
      e.deltaTokens,
      e.turnIndex,
      toDbJson(e.detail),
    ],
  );
}

async function insertFileOp(tx: Tx, tenantId: string, sessionId: string, op: FileOpInsert): Promise<void> {
  await tx.raw(
    `INSERT INTO ai_context_file_op
       (id, tenant_id, session_id, seq, path, kind, tool, err, added, removed, detail, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
    [
      op.id,
      tenantId,
      sessionId,
      op.seq,
      truncate(op.path, 512),
      op.kind,
      truncate(op.tool, 64),
      op.err,
      op.added,
      op.removed,
      op.detail ? truncate(op.detail, MAX_PREVIEW_LENGTH) : null,
    ],
  );
}

/** 会话聚合补丁：只更新出现的字段（跳过 undefined） */
const SESSION_PATCH_COLUMNS: Record<string, string> = {
  turnCount: "turn_count",
  stepCount: "step_count",
  injectCount: "inject_count",
  compactCount: "compact_count",
  pruneCount: "prune_count",
  skillCount: "skill_count",
  humanInputCount: "human_input_count",
  answerCount: "answer_count",
  currentSystem: "current_system",
  currentTools: "current_tools",
  currentUser: "current_user_msgs",
  currentInject: "current_inject",
  currentSkill: "current_skill",
  currentAssistant: "current_assistant",
  currentTool: "current_tool",
  currentTotal: "current_total",
  usageUncached: "usage_uncached",
  usageCacheRead: "usage_cache_read",
  usageCacheWrite: "usage_cache_write",
  usageOutput: "usage_output",
  durationMs: "duration_ms",
  model: "model",
  provider: "provider",
  contextWindow: "context_window",
  lastUser: "last_user",
  title: "title",
};

async function patchSession(
  tx: Tx,
  tenantId: string,
  sessionId: string,
  patch: SessionPatch,
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, column] of Object.entries(SESSION_PATCH_COLUMNS)) {
    const value = (patch as Record<string, unknown>)[key];
    if (value === undefined) continue;
    params.push(value === null ? null : value);
    sets.push(`${column} = $${params.length}`);
  }
  if (sets.length === 0) return;
  params.push(tenantId);
  const tenantIdx = params.length;
  params.push(sessionId);
  const sessionIdx = params.length;
  await tx.raw(
    `UPDATE ai_context_session
        SET ${sets.join(", ")}, rev = rev + 1
      WHERE tenant_id = $${tenantIdx} AND session_id = $${sessionIdx}`,
    params,
  );
}
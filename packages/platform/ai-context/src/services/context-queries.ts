/**
 * @ventostack/ai-context — 上下文查询（读）
 *
 * 供路由调用。所有查询强制 `tenant_id = ?`；概览聚合同样限定租户。
 * 跨租户不可见 → 返回空/404，不泄露资源是否存在。
 */

import type { Database } from "@ventostack/database";
import type {
  ActivityDay,
  ContextDetail,
  ContextOverview,
  ContextSession,
  RequestRecord,
  SurfaceNode,
  ContextEventRecord,
  FileOpRecord,
} from "../shared/types";
import { emptyOverview, num, str, toContextEvent, toContextSession, toRequestRecord, toSurfaceNode, ts } from "./context-mappers";
import type { RawRow } from "./context-mappers";

export interface SessionListParams {
  tenantId: string;
  page: number;
  pageSize: number;
  keyword?: string;
  agentId?: string;
  userId?: string;
  startTime?: string;
  endTime?: string;
  sort?: "recent" | "tokens" | "context";
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ContextQueries {
  listSessions(params: SessionListParams): Promise<Paginated<ContextSession>>;
  getSession(tenantId: string, sessionId: string): Promise<ContextSession | null>;
  getDetail(tenantId: string, sessionId: string): Promise<ContextDetail | null>;
  getOverview(tenantId: string, days: number, scope?: OverviewScope): Promise<ContextOverview>;
}

/** 概览的统计范围：缺省统计租户内全部用户，指定 userId 时只统计该用户 */
export interface OverviewScope {
  userId?: string;
}

const SORT_SQL: Record<NonNullable<SessionListParams["sort"]>, string> = {
  recent: "started_at DESC",
  tokens: "usage_uncached DESC, usage_output DESC",
  context: "current_total DESC",
};

export function createContextQueries(db: Database): ContextQueries {
  async function listSessions(params: SessionListParams): Promise<Paginated<ContextSession>> {
    const { tenantId, page, pageSize, sort } = params;
    // 租户缺失直接拒绝（fail-closed），不退化为跨租户列表
    if (!tenantId || tenantId.trim() === "") {
      throw new Error("ai-context: tenantId 不能为空（租户隔离要求 fail-closed）");
    }

    const where: string[] = ["tenant_id = $1"];
    const args: unknown[] = [tenantId];
    if (params.keyword) {
      args.push(`%${params.keyword}%`);
      where.push(`(title ILIKE $${args.length} OR session_id ILIKE $${args.length} OR last_user ILIKE $${args.length})`);
    }
    if (params.agentId) {
      args.push(params.agentId);
      where.push(`agent_id = $${args.length}`);
    }
    if (params.userId) {
      args.push(params.userId);
      where.push(`user_id = $${args.length}`);
    }
    if (params.startTime) {
      args.push(new Date(params.startTime));
      where.push(`started_at >= $${args.length}`);
    }
    if (params.endTime) {
      args.push(new Date(params.endTime));
      where.push(`started_at <= $${args.length}`);
    }
    const whereSql = where.join(" AND ");

    const countRows = (await db.raw(
      `SELECT COUNT(*)::int AS total FROM ai_context_session WHERE ${whereSql}`,
      args,
    )) as RawRow[];
    const total = num(countRows[0] ?? {}, "total");

    const orderBy = SORT_SQL[sort ?? "recent"];
    const listArgs = [...args];
    listArgs.push(pageSize, (page - 1) * pageSize);
    const rows = (await db.raw(
      `SELECT * FROM ai_context_session WHERE ${whereSql}
        ORDER BY ${orderBy}
        LIMIT $${listArgs.length - 1} OFFSET $${listArgs.length}`,
      listArgs,
    )) as RawRow[];

    return { items: rows.map(toContextSession), total, page, pageSize };
  }

  async function getSession(tenantId: string, sessionId: string): Promise<ContextSession | null> {
    if (!tenantId || tenantId.trim() === "") {
      throw new Error("ai-context: tenantId 不能为空（租户隔离要求 fail-closed）");
    }
    const rows = (await db.raw(
      `SELECT * FROM ai_context_session WHERE tenant_id = $1 AND session_id = $2`,
      [tenantId, sessionId],
    )) as RawRow[];
    const first = rows[0];
    return first ? toContextSession(first) : null;
  }

  async function getDetail(tenantId: string, sessionId: string): Promise<ContextDetail | null> {
    if (!tenantId || tenantId.trim() === "") {
      throw new Error("ai-context: tenantId 不能为空（租户隔离要求 fail-closed）");
    }
    const session = await getSession(tenantId, sessionId);
    if (!session) return null;

    const requestRows = (await db.raw(
      `SELECT * FROM ai_context_request
        WHERE tenant_id = $1 AND session_id = $2
        ORDER BY seq ASC`,
      [tenantId, sessionId],
    )) as RawRow[];

    const eventRows = (await db.raw(
      `SELECT * FROM ai_context_event
        WHERE tenant_id = $1 AND session_id = $2
        ORDER BY seq DESC
        LIMIT 400`,
      [tenantId, sessionId],
    )) as RawRow[];

    // 活跃面：仍存活的节点；归档面：被移走的节点
    const liveRows = (await db.raw(
      `SELECT * FROM ai_context_node
        WHERE tenant_id = $1 AND session_id = $2 AND gone_at_seq IS NULL
        ORDER BY seq ASC`,
      [tenantId, sessionId],
    )) as RawRow[];

    const archiveRows = (await db.raw(
      `SELECT * FROM ai_context_node
        WHERE tenant_id = $1 AND session_id = $2 AND gone_at_seq IS NOT NULL
        ORDER BY gone_at_seq DESC
        LIMIT 400`,
      [tenantId, sessionId],
    )) as RawRow[];

    const fileOpRows = (await db.raw(
      `SELECT * FROM ai_context_file_op
        WHERE tenant_id = $1 AND session_id = $2
        ORDER BY seq ASC
        LIMIT 400`,
      [tenantId, sessionId],
    )) as RawRow[];

    const nodes: SurfaceNode[] = liveRows.map(toSurfaceNode);
    const archive: SurfaceNode[] = archiveRows.map(toSurfaceNode);
    const requests: RequestRecord[] = requestRows.map(toRequestRecord);
    const events: ContextEventRecord[] = eventRows.map(toContextEvent);
    // 请求步数以实际落库的请求快照为准：step_count 是「本 run 绝对值」的会话补丁，
    // 多轮对话下会被后一轮覆盖，而请求行只增不改，是唯一可信口径。
    session.counts.steps = requests.length;
    const fileOps: FileOpRecord[] = fileOpRows.map((r) => ({
      id: str(r, "id") ?? "",
      sessionId: str(r, "session_id") ?? "",
      seq: num(r, "seq"),
      path: str(r, "path") ?? "",
      kind: str(r, "kind") as FileOpRecord["kind"] ?? "read",
      tool: str(r, "tool") ?? "",
      err: r.err === true,
      added: num(r, "added"),
      removed: num(r, "removed"),
      detail: str(r, "detail"),
      createdAt: ts(r, "created_at") ?? "",
    }));

    return {
      session,
      requests,
      events,
      nodes,
      droppedNodes: 0,
      archive,
      archiveFloor: archive.length > 0 ? (archive.at(-1)?.goneAtSeq ?? null) : null,
      fileOps,
      rev: 0,
    };
  }

  async function getOverview(
    tenantId: string,
    days: number,
    scope?: OverviewScope,
  ): Promise<ContextOverview> {
    if (!tenantId || tenantId.trim() === "") {
      throw new Error("ai-context: tenantId 不能为空（租户隔离要求 fail-closed）");
    }
    const overview = emptyOverview();
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const scopeUserId = scope?.userId;

    // 可选的用户收窄：显式传值才追加条件，缺省统计租户内全部用户
    const sessionWhere = ["tenant_id = $1", "started_at >= $2"];
    const sessionArgs: unknown[] = [tenantId, since];
    if (scopeUserId) {
      sessionArgs.push(scopeUserId);
      sessionWhere.push(`user_id = $${sessionArgs.length}`);
    }
    const sessionWhereSql = sessionWhere.join(" AND ");

    const sessionRows = (await db.raw(
      `SELECT COUNT(*)::int AS session_count,
              COALESCE(SUM(usage_uncached), 0)::bigint AS uncached,
              COALESCE(SUM(usage_cache_read), 0)::bigint AS cache_read,
              COALESCE(SUM(usage_cache_write), 0)::bigint AS cache_write,
              COALESCE(SUM(usage_output), 0)::bigint AS output,
              -- 请求数按实际落库的请求快照统计：step_count 是「本 run 绝对值」的会话补丁，
              -- 多轮对话下会被后一轮覆盖，用它求和会少算
              (SELECT COUNT(*)::int FROM ai_context_request r
                WHERE r.tenant_id = $1 AND r.created_at >= $2) AS request_count,
              COALESCE(SUM(current_system), 0)::bigint AS cur_system,
              COALESCE(SUM(current_tools), 0)::bigint AS cur_tools,
              COALESCE(SUM(current_user_msgs), 0)::bigint AS cur_user,
              COALESCE(SUM(current_inject), 0)::bigint AS cur_inject,
              COALESCE(SUM(current_skill), 0)::bigint AS cur_skill,
              COALESCE(SUM(current_assistant), 0)::bigint AS cur_assistant,
              COALESCE(SUM(current_tool), 0)::bigint AS cur_tool
         FROM ai_context_session
        WHERE tenant_id = $1 AND started_at >= $2`,
      [tenantId, since],
    )) as RawRow[];

    const agg = sessionRows[0] ?? {};
    overview.sessionCount = num(agg, "session_count");
    overview.requestCount = num(agg, "request_count");

    const uncached = num(agg, "uncached");
    const cacheRead = num(agg, "cache_read");
    const cacheWrite = num(agg, "cache_write");
    const output = num(agg, "output");
    overview.billedTokens = uncached + cacheRead + cacheWrite + output;

    // 缓存命中率：仅在确实有缓存读时才有意义，否则诚实返回 null（不伪造 0）
    const promptSide = uncached + cacheRead + cacheWrite;
    overview.cacheHitRate = promptSide > 0 ? cacheRead / promptSide : null;

    overview.composition = {
      system: num(agg, "cur_system"),
      tools: num(agg, "cur_tools"),
      user: num(agg, "cur_user"),
      inject: num(agg, "cur_inject"),
      skill: num(agg, "cur_skill"),
      assistant: num(agg, "cur_assistant"),
      tool: num(agg, "cur_tool"),
      total: 0,
    };
    overview.composition.total =
      overview.composition.system +
      overview.composition.tools +
      overview.composition.user +
      overview.composition.inject +
      overview.composition.skill +
      overview.composition.assistant +
      overview.composition.tool;

    // 按天账目（热力图 / 7 日柱状图）
    // ai_context_request 不冗余 user_id，按用户收窄时回关联会话表（同样带租户条件）
    const dayWhere = ["r.tenant_id = $1", "r.created_at >= $2"];
    const dayArgs: unknown[] = [tenantId, since];
    if (scopeUserId) {
      dayArgs.push(scopeUserId);
      dayWhere.push(
        `EXISTS (SELECT 1 FROM ai_context_session s
                  WHERE s.tenant_id = r.tenant_id AND s.session_id = r.session_id
                    AND s.user_id = $${dayArgs.length})`,
      );
    }
    const dayWhereSql = dayWhere.join(" AND ");
    const dayRows = (await db.raw(
      `SELECT to_char(r.created_at, 'YYYY-MM-DD') AS day,
              COALESCE(SUM(r.act_uncached + r.act_cache_read + r.act_cache_write + r.act_output), 0)::bigint AS tokens,
              COUNT(*)::int AS requests
         FROM ai_context_request r
        WHERE ${dayWhereSql}
        GROUP BY 1
        ORDER BY 1 ASC`,
      dayArgs,
    )) as RawRow[];

    overview.days = dayRows.map(
      (r): ActivityDay => ({
        day: str(r, "day") ?? "",
        tokens: num(r, "tokens"),
        requests: num(r, "requests"),
        // VentoStack AI 模块不上报缓存/计价信息，成本诚实留空（显示 -）
        cost: null,
      }),
    );

    return overview;
  }

  return { listSessions, getSession, getDetail, getOverview };
}
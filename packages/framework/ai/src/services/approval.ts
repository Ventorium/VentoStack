/**
 * 审批服务 — 工具调用审批持久化
 * 与现有 ApprovalManager 接口对齐，新增数据库持久化和自动过期
 */
import type { Database } from "@ventostack/database";
import type { EventBus } from "@ventostack/events";

export interface ApprovalRequest {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  requestedBy: string;
  status: "pending" | "approved" | "rejected" | "expired";
  approvedBy: string | null;
  comment: string | null;
  expiresAt: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalServiceDeps {
  db: Database;
  eventBus?: EventBus;
}

/** 审批请求待审批有效期：24 小时（超时未处理自动过期） */
const PENDING_EXPIRY_MS = 24 * 60 * 60 * 1000;
/** 批准后的使用窗口：10 分钟内同用户同参数重试可直接放行 */
export const APPROVED_VALIDITY_MS = 10 * 60 * 1000;
/** 机会性清理的最小间隔：10 分钟（避免每次轮询都打清理 SQL） */
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

/** 将查询结果行映射为 ApprovalRequest */
function mapRow(r: Record<string, unknown>): ApprovalRequest {
  return {
    id: r.id as string,
    toolName: r.toolName as string,
    input: (r.input as Record<string, unknown>) ?? {},
    requestedBy: r.requestedBy as string,
    status: r.status as "pending" | "approved" | "rejected" | "expired",
    approvedBy: (r.approvedBy as string) ?? null,
    comment: (r.comment as string) ?? null,
    expiresAt: r.expiresAt instanceof Date ? r.expiresAt.toISOString() : String(r.expiresAt ?? ""),
    tenantId: r.tenantId as string,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? ""),
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt ?? ""),
  };
}

/**
 * 规范化 JSON 序列化：递归按键排序，保证对象键序不影响等价比较。
 * 用于审批请求的 input 存储与放行比对，避免同一参数因键序不同被误判。
 */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function createApprovalService(deps: ApprovalServiceDeps) {
  const { db, eventBus } = deps;
  let lastCleanupAt = 0;

  /** 机会性清理：将过期 pending 请求标记为 expired（按最小间隔节流，失败不影响主流程） */
  async function opportunisticCleanup(): Promise<void> {
    const now = Date.now();
    if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
    lastCleanupAt = now;
    try {
      await cleanup();
    } catch {
      /* 清理失败不阻断审批主流程 */
    }
  }

  async function request(
    toolName: string,
    input: Record<string, unknown>,
    requestedBy: string,
    tenantId: string,
  ): Promise<ApprovalRequest> {
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + PENDING_EXPIRY_MS);

    await db.raw(
      `INSERT INTO ai_approval_request (id, tool_name, input, requested_by, status, expires_at, tenant_id)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6)`,
      [id, toolName, canonicalJson(input), requestedBy, expiresAt, tenantId],
    );

    await eventBus?.emit("ai.approval.requested", { id, toolName, tenantId });
    void opportunisticCleanup();

    return {
      id,
      toolName,
      input,
      requestedBy,
      status: "pending",
      approvedBy: null,
      comment: null,
      expiresAt: expiresAt.toISOString(),
      tenantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async function approve(
    id: string,
    reviewedBy: string,
    reason?: string,
    tenantId?: string,
  ): Promise<ApprovalRequest | null> {
    const request = await getStatus(id);
    if (!request) return null;
    // 租户校验：只能审批本租户的请求
    if (tenantId && request.tenantId !== tenantId) return null;
    // 禁止自批：发起人不能审批自己发起的请求
    if (request.requestedBy === reviewedBy) {
      throw new Error("不能审批自己发起的请求");
    }

    // 批准后的使用窗口从批准时刻起算（而非请求时刻），
    // 保证管理员响应耗时不会吞掉重试窗口
    const approvedUntil = new Date(Date.now() + APPROVED_VALIDITY_MS);

    // 原子更新：仅 pending 且未过期的请求可被批准，过期请求返回 null；
    // RETURNING 保证并发下只有真正生效的 UPDATE 被视为成功（避免双管理员重复放行/重复事件）
    const updatedRows = await db.raw(
      `UPDATE ai_approval_request SET status = 'approved', approved_by = $1, comment = $2, expires_at = $3, updated_at = NOW() WHERE id = $4 AND status = 'pending' AND expires_at > NOW() RETURNING id`,
      [reviewedBy, reason ?? null, approvedUntil, id],
    ) as unknown[];
    if (!Array.isArray(updatedRows) || updatedRows.length === 0) return null;

    const updated = await getStatus(id);
    // 读回兜底：RETURNING 生效但读回异常时仍视为不可批准
    if (updated?.status !== "approved") return null;
    await eventBus?.emit("ai.approval.approved", { id, toolName: updated.toolName, reviewedBy, tenantId: updated.tenantId });
    return updated;
  }

  async function reject(
    id: string,
    reviewedBy: string,
    reason?: string,
    tenantId?: string,
  ): Promise<ApprovalRequest | null> {
    const request = await getStatus(id);
    if (!request) return null;
    // 租户校验：只能拒绝本租户的请求
    if (tenantId && request.tenantId !== tenantId) return null;
    // 禁止自批：发起人不能拒绝自己发起的请求
    if (request.requestedBy === reviewedBy) {
      throw new Error("不能拒绝自己发起的请求");
    }

    // 原子更新：仅 pending 且未过期的请求可被拒绝；RETURNING 保证并发下只报一次成功
    const updatedRows = await db.raw(
      `UPDATE ai_approval_request SET status = 'rejected', approved_by = $1, comment = $2, updated_at = NOW() WHERE id = $3 AND status = 'pending' AND expires_at > NOW() RETURNING id`,
      [reviewedBy, reason ?? null, id],
    ) as unknown[];
    if (!Array.isArray(updatedRows) || updatedRows.length === 0) return null;

    const updated = await getStatus(id);
    if (updated?.status !== "rejected") return null;
    await eventBus?.emit("ai.approval.rejected", { id, toolName: updated.toolName, reviewedBy, tenantId: updated.tenantId });
    return updated;
  }

  async function getStatus(id: string): Promise<ApprovalRequest | null> {
    const rows = await db.raw(
      `SELECT id, tool_name as "toolName", input, requested_by as "requestedBy",
              status, approved_by as "approvedBy", comment, expires_at as "expiresAt",
              tenant_id as "tenantId", created_at as "createdAt", updated_at as "updatedAt"
       FROM ai_approval_request WHERE id = $1`,
      [id],
    );
    return rows.length === 0 ? null : mapRow(rows[0] as Record<string, unknown>);
  }

  /**
   * 查找指定用户对指定工具「已批准、未过期且 input 完全一致」的最近审批请求。
   * 用于授权链路：审批通过后，用户重试同工具、同参数调用时可直接放行；
   * 参数不同（canonicalJson 不等）时必须新建审批，防止审批被不同载荷复用。
   */
  async function findRecentApproved(
    toolName: string,
    input: Record<string, unknown>,
    userId: string,
    tenantId: string,
  ): Promise<ApprovalRequest | null> {
    const rows = await db.raw(
      `SELECT id, tool_name as "toolName", input, requested_by as "requestedBy",
              status, approved_by as "approvedBy", comment, expires_at as "expiresAt",
              tenant_id as "tenantId", created_at as "createdAt", updated_at as "updatedAt"
       FROM ai_approval_request
       WHERE tool_name = $1 AND requested_by = $2 AND tenant_id = $3
         AND status = 'approved' AND expires_at > NOW()
         AND input::text = $4
       ORDER BY updated_at DESC LIMIT 1`,
      [toolName, userId, tenantId, canonicalJson(input)],
    );
    return rows.length === 0 ? null : mapRow(rows[0] as Record<string, unknown>);
  }

  async function listPending(tenantId: string): Promise<ApprovalRequest[]> {
    const rows = await db.raw(
      `SELECT id, tool_name as "toolName", input, requested_by as "requestedBy",
              status, approved_by as "approvedBy", comment, expires_at as "expiresAt",
              tenant_id as "tenantId", created_at as "createdAt", updated_at as "updatedAt"
       FROM ai_approval_request
       WHERE tenant_id = $1 AND status = 'pending' AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [tenantId],
    );

    return (rows as Array<Record<string, unknown>>).map(mapRow);
  }

  async function cleanup(): Promise<number> {
    // 将过期的 pending 请求标记为 expired
    const result = await db.raw(
      `UPDATE ai_approval_request SET status = 'expired', updated_at = NOW()
       WHERE status = 'pending' AND expires_at < NOW()`,
    );
    return Array.isArray(result) ? result.length : 0;
  }

  return { request, approve, reject, getStatus, findRecentApproved, listPending, cleanup };
}

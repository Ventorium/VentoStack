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

/** 审批请求默认过期时间：5 分钟 */
const EXPIRY_MS = 5 * 60 * 1000;

export function createApprovalService(deps: ApprovalServiceDeps) {
  const { db, eventBus } = deps;

  async function request(
    toolName: string,
    input: Record<string, unknown>,
    requestedBy: string,
    tenantId: string,
  ): Promise<ApprovalRequest> {
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + EXPIRY_MS);

    await db.raw(
      `INSERT INTO ai_approval_request (id, tool_name, input, requested_by, status, expires_at, tenant_id)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6)`,
      [id, toolName, JSON.stringify(input), requestedBy, expiresAt, tenantId],
    );

    await eventBus?.emit("ai.approval.requested", { id, toolName, tenantId });

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
  ): Promise<ApprovalRequest | null> {
    await db.raw(
      `UPDATE ai_approval_request SET status = 'approved', approved_by = $1, comment = $2, updated_at = NOW()
       WHERE id = $3 AND status = 'pending'`,
      [reviewedBy, reason ?? null, id],
    );

    const request = await getStatus(id);
    if (request?.status === "approved") {
      await eventBus?.emit("ai.approval.approved", { id, reviewedBy });
    }
    return request;
  }

  async function reject(
    id: string,
    reviewedBy: string,
    reason?: string,
  ): Promise<ApprovalRequest | null> {
    await db.raw(
      `UPDATE ai_approval_request SET status = 'rejected', approved_by = $1, comment = $2, updated_at = NOW()
       WHERE id = $3 AND status = 'pending'`,
      [reviewedBy, reason ?? null, id],
    );

    const request = await getStatus(id);
    if (request?.status === "rejected") {
      await eventBus?.emit("ai.approval.rejected", { id, reviewedBy });
    }
    return request;
  }

  async function getStatus(id: string): Promise<ApprovalRequest | null> {
    const rows = await db.raw(
      `SELECT id, tool_name as "toolName", input, requested_by as "requestedBy",
              status, approved_by as "approvedBy", comment, expires_at as "expiresAt",
              tenant_id as "tenantId", created_at as "createdAt", updated_at as "updatedAt"
       FROM ai_approval_request WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) return null;
    const r = rows[0] as Record<string, unknown>;
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

    return (rows as Array<Record<string, unknown>>).map((r) => ({
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
    }));
  }

  async function cleanup(): Promise<number> {
    // 将过期的 pending 请求标记为 expired
    const result = await db.raw(
      `UPDATE ai_approval_request SET status = 'expired', updated_at = NOW()
       WHERE status = 'pending' AND expires_at < NOW()`,
    );
    return Array.isArray(result) ? result.length : 0;
  }

  return { request, approve, reject, getStatus, listPending, cleanup };
}

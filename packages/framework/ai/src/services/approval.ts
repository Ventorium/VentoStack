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
  /** 发起该审批的对话会话（聊天内审批）；管理员/API 直接发起时为 null */
  sessionId: string | null;
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
    sessionId: (r.sessionId as string | null) ?? null,
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
    options?: {
      /** 待审批有效期覆盖（聊天内审批对齐等待窗口用）；缺省 24 小时 */
      ttlMs?: number;
      /** 发起该审批的对话会话（聊天内审批），用于把审批台账写回会话历史 */
      sessionId?: string;
    },
  ): Promise<ApprovalRequest> {
    const id = crypto.randomUUID();
    const ttlMs = options?.ttlMs ?? PENDING_EXPIRY_MS;
    const expiresAt = new Date(Date.now() + ttlMs);
    const sessionId = options?.sessionId ?? null;

    await db.raw(
      `INSERT INTO ai_approval_request (id, tool_name, input, requested_by, status, expires_at, tenant_id, session_id)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7)`,
      [id, toolName, canonicalJson(input), requestedBy, expiresAt, tenantId, sessionId],
    );

    await eventBus?.emit({ name: "ai.approval.requested" }, { id, toolName, tenantId, sessionId });
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
      sessionId,
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
    await eventBus?.emit({ name: "ai.approval.approved" }, { id, toolName: updated.toolName, reviewedBy, tenantId: updated.tenantId, requestedBy: updated.requestedBy, sessionId: updated.sessionId, reason: reason ?? null });
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
    await eventBus?.emit({ name: "ai.approval.rejected" }, { id, toolName: updated.toolName, reviewedBy, tenantId: updated.tenantId, requestedBy: updated.requestedBy, sessionId: updated.sessionId, reason: reason ?? null });
    return updated;
  }

  /**
   * 请求者自确认（聊天内嵌审批）：仅发起者本人可对自己的 pending 请求做出 decision。
   * 与 approve/reject 的管理员路径互不影响（那两条路径仍禁止自批）。
   */
  async function confirmByRequester(
    id: string,
    userId: string,
    tenantId: string,
    approved: boolean,
    reason?: string,
  ): Promise<ApprovalRequest | null> {
    const request = await getStatus(id);
    if (!request) return null;
    // 租户校验：只能确认本租户的请求
    if (tenantId && request.tenantId !== tenantId) return null;
    // 仅请求者本人可自确认
    if (request.requestedBy !== userId) return null;

    const comment = `[chat-self-confirm]${reason ? ` ${reason}` : ""}`;
    let updatedRows: unknown[];
    if (approved) {
      // 批准后的使用窗口从确认时刻起算（与 approve 语义一致）
      const approvedUntil = new Date(Date.now() + APPROVED_VALIDITY_MS);
      updatedRows = await db.raw(
        `UPDATE ai_approval_request SET status = 'approved', approved_by = $1, comment = $2, expires_at = $3, updated_at = NOW() WHERE id = $4 AND status = 'pending' AND expires_at > NOW() RETURNING id`,
        [userId, comment, approvedUntil, id],
      ) as unknown[];
    } else {
      updatedRows = await db.raw(
        `UPDATE ai_approval_request SET status = 'rejected', approved_by = $1, comment = $2, updated_at = NOW() WHERE id = $3 AND status = 'pending' AND expires_at > NOW() RETURNING id`,
        [userId, comment, id],
      ) as unknown[];
    }
    if (!Array.isArray(updatedRows) || updatedRows.length === 0) return null;

    const updated = await getStatus(id);
    const expectedStatus = approved ? "approved" : "rejected";
    if (updated?.status !== expectedStatus) return null;
    await eventBus?.emit({ name: approved ? "ai.approval.approved" : "ai.approval.rejected" }, { id, toolName: updated.toolName, reviewedBy: userId, tenantId: updated.tenantId, requestedBy: updated.requestedBy, sessionId: updated.sessionId, reason: reason ?? null });
    return updated;
  }

  async function getStatus(id: string): Promise<ApprovalRequest | null> {
    const rows = await db.raw(
      `SELECT id, tool_name as "toolName", input, requested_by as "requestedBy",
              status, approved_by as "approvedBy", comment, expires_at as "expiresAt",
              tenant_id as "tenantId", session_id as "sessionId",
              created_at as "createdAt", updated_at as "updatedAt"
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
              tenant_id as "tenantId", session_id as "sessionId",
              created_at as "createdAt", updated_at as "updatedAt"
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
              tenant_id as "tenantId", session_id as "sessionId",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM ai_approval_request
       WHERE tenant_id = $1 AND status = 'pending' AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [tenantId],
    );

    return (rows as Array<Record<string, unknown>>).map(mapRow);
  }

  /**
   * 单条审批超时过期（默认拒绝）：仅 pending 可转 expired（幂等），并广播 ai.approval.expired。
   * 与批量 cleanup 的区别：带 reason 且广播事件，供会话审批台账记一条决议。
   */
  async function expire(id: string, reason = "等待超时，已默认拒绝"): Promise<ApprovalRequest | null> {
    const request = await getStatus(id);
    if (!request) return null;
    const updatedRows = (await db.raw(
      `UPDATE ai_approval_request SET status = 'expired', comment = $1, updated_at = NOW()
       WHERE id = $2 AND status = 'pending' RETURNING id`,
      [reason, id],
    )) as unknown[];
    if (!Array.isArray(updatedRows) || updatedRows.length === 0) return null;

    const updated = await getStatus(id);
    if (updated?.status !== "expired") return null;
    await eventBus?.emit(
      { name: "ai.approval.expired" },
      { id, toolName: updated.toolName, reviewedBy: null, tenantId: updated.tenantId, requestedBy: updated.requestedBy, sessionId: updated.sessionId, reason },
    );
    return updated;
  }

  async function cleanup(): Promise<number> {
    // 将过期的 pending 请求标记为 expired
    const result = await db.raw(
      `UPDATE ai_approval_request SET status = 'expired', updated_at = NOW()
       WHERE status = 'pending' AND expires_at < NOW()`,
    );
    return Array.isArray(result) ? result.length : 0;
  }

  return { request, approve, reject, confirmByRequester, expire, getStatus, findRecentApproved, listPending, cleanup };
}

/** 聊天内嵌审批的单次等待上限：10 分钟（超时后请求保留，用户可重新发起该操作） */
export const IN_CHAT_APPROVAL_WAIT_MS = 10 * 60 * 1000;

/** 审批 decision 事件载荷 */
interface ApprovalEventPayload {
  id: string;
  toolName: string;
  reviewedBy: string | null;
  tenantId: string;
  requestedBy: string;
  sessionId?: string | null;
  reason?: string | null;
}

/** 审批等待结果：status 用于向会话流下发 approval_resolved 节点 */
export interface ApprovalWaitResult {
  approved: boolean;
  reason?: string;
  status?: "approved" | "rejected" | "expired";
}

export interface ApprovalWaiterDeps {
  getStatus: (id: string) => Promise<ApprovalRequest | null>;
  eventBus?: EventBus;
}

/**
 * 创建审批等待器：在 SSE 流内挂起等待人工 decision（聊天内自确认，含其他已登录标签页发起的确认）。
 * 基于同进程事件总线感知 decision；显式停止（signal abort）或超时返回 deny，
 * pending 请求保留至过期，过期后由 cleanup 清理。
 * 注意：事件总线为进程内存实现，多实例部署时审批请求需与 SSE 流同进程处理。
 */
export function createApprovalWaiter(deps: ApprovalWaiterDeps): (
  request: { id: string; expiresAt: string },
  signal?: AbortSignal,
) => Promise<ApprovalWaitResult> {
  const { eventBus } = deps;
  return async (request, signal) => {
    if (signal?.aborted) {
      return { approved: false, reason: "已停止生成，该工具未执行", status: "expired" };
    }

    return new Promise((resolve) => {
      let settled = false;
      const cleanups: Array<() => void> = [];
      const finish = (result: ApprovalWaitResult): void => {
        if (settled) return;
        settled = true;
        for (const fn of cleanups) fn();
        resolve(result);
      };

      // 先订阅 decision 事件再查状态，避免「先查后订」窗口内事件丢失导致挂到超时
      if (eventBus) {
        const offApproved = eventBus.on({ name: "ai.approval.approved" }, (payload) => {
          if ((payload as ApprovalEventPayload)?.id === request.id) {
            finish({ approved: true, reason: "该工具调用已获确认", status: "approved" });
          }
        });
        const offRejected = eventBus.on({ name: "ai.approval.rejected" }, (payload) => {
          if ((payload as ApprovalEventPayload)?.id === request.id) {
            finish({ approved: false, reason: "该工具调用已被拒绝", status: "rejected" });
          }
        });
        // 超时过期（由服务端 expire 广播）同样结束等待，避免等到本地定时器
        const offExpired = eventBus.on({ name: "ai.approval.expired" }, (payload) => {
          if ((payload as ApprovalEventPayload)?.id === request.id) {
            finish({ approved: false, reason: "审批等待超时，已默认拒绝", status: "expired" });
          }
        });
        cleanups.push(offApproved, offRejected, offExpired);
      }

      // 显式停止（用户点停止按钮）：审批随之作废（与超时同构：未执行 → 过期），
      // 由调用方（module 的 waitForApproval 包装）落审批单终态与决议台账
      const onAbort = (): void =>
        finish({ approved: false, reason: "已停止生成，该工具未执行", status: "expired" });
      signal?.addEventListener("abort", onAbort, { once: true });
      cleanups.push(() => signal?.removeEventListener("abort", onAbort));

      // 超时：等待上限与请求自身过期时间取较小值
      const expiresMs = Date.parse(request.expiresAt);
      const waitMs = Number.isFinite(expiresMs)
        ? Math.max(0, Math.min(IN_CHAT_APPROVAL_WAIT_MS, expiresMs - Date.now()))
        : IN_CHAT_APPROVAL_WAIT_MS;
      const timer = setTimeout(
        () => finish({ approved: false, reason: "审批等待超时，已默认拒绝", status: "expired" }),
        waitMs,
      );
      cleanups.push(() => clearTimeout(timer));

      // 竞态兜底：订阅就绪后查一次状态（审批卡片下发后用户可能已秒点通过）
      void deps
        .getStatus(request.id)
        .then((current) => {
          if (settled || !current) return;
          if (current.status === "approved") {
            finish({ approved: true, reason: "该工具调用已获确认", status: "approved" });
          } else if (current.status === "rejected") {
            finish({ approved: false, reason: "该工具调用已被拒绝", status: "rejected" });
          } else if (current.status === "expired") {
            finish({ approved: false, reason: "审批请求已过期", status: "expired" });
          }
        })
        .catch(() => {
          // 状态查询失败不结束等待：仍有事件订阅、停止与超时三重兜底
        });
    });
  };
}

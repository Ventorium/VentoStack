/**
 * @ventostack/ai — 审批流
 *
 * 提供敏感工具调用的人工审批机制，支持提交、批准、拒绝、过期清理等生命周期管理。
 */

import { generateId } from "@ventostack/core";

/** 审批状态 */
export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

/** 审批请求 */
export interface ApprovalRequest {
  /** 请求唯一标识 */
  id: string;
  /** 待审批的工具名称 */
  toolName: string;
  /** 工具调用参数 */
  params: Record<string, unknown>;
  /** 请求发起者 */
  requestedBy: string;
  /** 请求时间（毫秒时间戳） */
  requestedAt: number;
  /** 当前审批状态 */
  status: ApprovalStatus;
  /** 审批人 */
  reviewedBy?: string;
  /** 审批时间（毫秒时间戳） */
  reviewedAt?: number;
  /** 审批理由 */
  reason?: string;
  /** 过期时间（毫秒时间戳） */
  expiresAt: number;
}

/** 审批管理器选项 */
export interface ApprovalOptions {
  /** 默认审批请求有效期（毫秒），默认 1 小时 */
  defaultTTL?: number;
  /** 新请求创建时的回调 */
  onRequest?: (request: ApprovalRequest) => void;
  /** 审批完成时的回调 */
  onReview?: (request: ApprovalRequest) => void;
}

/** 审批管理器，负责工具调用的审批请求生命周期 */
export interface ApprovalManager {
  /**
   * 提交审批请求
   * @param toolName - 工具名称
   * @param params - 工具调用参数
   * @param requestedBy - 请求发起者
   * @returns 创建的审批请求
   */
  request(
    toolName: string,
    params: Record<string, unknown>,
    requestedBy: string,
  ): Promise<ApprovalRequest>;

  /**
   * 批准请求
   * @param id - 审批请求 ID
   * @param reviewedBy - 审批人
   * @param reason - 可选的审批理由
   * @returns 更新后的审批请求，不存在或已处理返回 null
   */
  approve(id: string, reviewedBy: string, reason?: string): ApprovalRequest | null;

  /**
   * 拒绝请求
   * @param id - 审批请求 ID
   * @param reviewedBy - 审批人
   * @param reason - 可选的拒绝理由
   * @returns 更新后的审批请求，不存在或已处理返回 null
   */
  reject(id: string, reviewedBy: string, reason?: string): ApprovalRequest | null;

  /**
   * 获取审批请求状态
   * @param id - 审批请求 ID
   * @returns 审批请求，不存在返回 null
   */
  getStatus(id: string): ApprovalRequest | null;

  /**
   * 列出所有待处理的审批请求
   * @returns 待处理请求数组
   */
  listPending(): ApprovalRequest[];

  /**
   * 清理已过期的审批请求
   * @returns 清理的请求数量
   */
  cleanup(): number;
}

/** 默认审批有效期：1 小时（毫秒） */
const DEFAULT_TTL = 3_600_000;

/**
 * 创建审批管理器实例
 * @param options - 可选的审批管理器配置
 * @returns ApprovalManager 实例
 */
export function createApprovalManager(options?: ApprovalOptions): ApprovalManager {
  const requests = new Map<string, ApprovalRequest>();
  const ttl = options?.defaultTTL ?? DEFAULT_TTL;

  async function request(
    toolName: string,
    params: Record<string, unknown>,
    requestedBy: string,
  ): Promise<ApprovalRequest> {
    const now = Date.now();
    const req: ApprovalRequest = {
      id: generateId(),
      toolName,
      params,
      requestedBy,
      requestedAt: now,
      status: "pending",
      expiresAt: now + ttl,
    };
    requests.set(req.id, req);
    options?.onRequest?.(req);
    return req;
  }

  function approve(id: string, reviewedBy: string, reason?: string): ApprovalRequest | null {
    const req = requests.get(id);
    if (!req || req.status !== "pending") {
      return null;
    }
    if (req.expiresAt < Date.now()) {
      req.status = "expired";
      return null;
    }
    req.status = "approved";
    req.reviewedBy = reviewedBy;
    req.reviewedAt = Date.now();
    if (reason !== undefined) {
      req.reason = reason;
    }
    options?.onReview?.(req);
    return req;
  }

  function reject(id: string, reviewedBy: string, reason?: string): ApprovalRequest | null {
    const req = requests.get(id);
    if (!req || req.status !== "pending") {
      return null;
    }
    if (req.expiresAt < Date.now()) {
      req.status = "expired";
      return null;
    }
    req.status = "rejected";
    req.reviewedBy = reviewedBy;
    req.reviewedAt = Date.now();
    if (reason !== undefined) {
      req.reason = reason;
    }
    options?.onReview?.(req);
    return req;
  }

  function getStatus(id: string): ApprovalRequest | null {
    return requests.get(id) ?? null;
  }

  function listPending(): ApprovalRequest[] {
    const now = Date.now();
    const pending: ApprovalRequest[] = [];
    for (const req of requests.values()) {
      if (req.status === "pending" && req.expiresAt >= now) {
        pending.push(req);
      }
    }
    return pending;
  }

  function cleanup(): number {
    const now = Date.now();
    let count = 0;
    for (const [id, req] of requests) {
      if (req.expiresAt < now) {
        requests.delete(id);
        count++;
      }
    }
    return count;
  }

  return {
    request,
    approve,
    reject,
    getStatus,
    listPending,
    cleanup,
  };
}

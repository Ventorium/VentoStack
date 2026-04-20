// Approval - 审批流

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export interface ApprovalRequest {
  id: string;
  toolName: string;
  params: Record<string, unknown>;
  requestedBy: string;
  requestedAt: number;
  status: ApprovalStatus;
  reviewedBy?: string;
  reviewedAt?: number;
  reason?: string;
  expiresAt: number;
}

export interface ApprovalOptions {
  defaultTTL?: number;
  onRequest?: (request: ApprovalRequest) => void;
  onReview?: (request: ApprovalRequest) => void;
}

export interface ApprovalManager {
  request(toolName: string, params: Record<string, unknown>, requestedBy: string): Promise<ApprovalRequest>;
  approve(id: string, reviewedBy: string, reason?: string): ApprovalRequest | null;
  reject(id: string, reviewedBy: string, reason?: string): ApprovalRequest | null;
  getStatus(id: string): ApprovalRequest | null;
  listPending(): ApprovalRequest[];
  cleanup(): number;
}

const DEFAULT_TTL = 3_600_000; // 1 hour

function generateId(): string {
  return crypto.randomUUID();
}

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

/**
 * 审计日志
 */

import { createAuditLog } from "@ventostack/observability";
import type { AuditStore } from "@ventostack/observability";

let _audit: AuditStore | null = null;

export function createAppAuditLog(): AuditStore {
  if (_audit) return _audit;
  _audit = createAuditLog();
  return _audit;
}

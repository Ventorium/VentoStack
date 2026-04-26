/**
 * 系统模块装配 + 额外路由
 *
 * 将 @ventostack/system 的 createSystemModule 与后端基础设施绑在一起，
 * 同时注册 admin 需要但 system 包可能尚未包含的补充路由。
 */

import { createSystemModule } from "@ventostack/system";
import type { SystemModule } from "@ventostack/system";
import type { Cache } from "@ventostack/cache";
import type { SqlExecutor } from "@ventostack/database";
import type { AuditStore } from "@ventostack/observability";
import { createEventBus } from "@ventostack/events";
import type { AuthEngines } from "../auth";

export interface SystemModuleOptions {
  executor: SqlExecutor;
  cache: Cache;
  auth: AuthEngines;
  auditLog: AuditStore;
}

/**
 * 装配系统模块
 */
export function assembleSystemModule(options: SystemModuleOptions): SystemModule {
  const { executor, cache, auth, auditLog } = options;
  const eventBus = createEventBus();

  return createSystemModule({
    executor,
    cache,
    jwt: auth.jwt,
    jwtSecret: auth.jwtSecret,
    passwordHasher: auth.passwordHasher,
    totp: auth.totp,
    rbac: auth.rbac,
    rowFilter: auth.rowFilter,
    sessionManager: auth.sessionManager,
    deviceManager: auth.deviceManager,
    tokenRefresh: auth.tokenRefresh,
    authSessionManager: auth.authSessionManager,
    auditLog,
    eventBus,
  });
}

/**
 * 系统模块装配 + 额外路由
 *
 * 将 @ventostack/system 的 createSystemModule 与后端基础设施绑在一起，
 * 同时注册 admin 需要但 system 包可能尚未包含的补充路由。
 */

import { createSystemModule } from "@ventostack/system";
import type { SystemModule, FileUploader } from "@ventostack/system";
import type { Cache } from "@ventostack/cache";
import type { SqlExecutor } from "@ventostack/database";
import type { AuditStore } from "@ventostack/observability";
import { createEventBus } from "@ventostack/events";
import type { OSSService } from "@ventostack/oss";
import type { AuthEngines } from "../auth";
import { env } from "../config";

export interface SystemModuleOptions {
  executor: SqlExecutor;
  cache: Cache;
  auth: AuthEngines;
  auditLog: AuditStore;
  ossService?: OSSService;
}

/**
 * 将 OSSService 适配为 FileUploader 接口
 */
function createOSSFileUploader(ossService: OSSService): FileUploader {
  return {
    async upload(filename, data, contentType, bucket, uploaderId) {
      const result = await ossService.upload({ filename, data, contentType, bucket }, uploaderId);
      const url = await ossService.getSignedUrl(result.id);
      if (!url) throw new Error("Failed to get signed URL");
      return url;
    },
  };
}

/**
 * 装配系统模块
 */
export function assembleSystemModule(options: SystemModuleOptions): SystemModule {
  const { executor, cache, auth, auditLog, ossService } = options;
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
    rpID: env.WEBAUTHN_RP_ID,
    rpName: env.WEBAUTHN_RP_NAME,
    rpOrigins: env.ALLOWED_ORIGINS,
    ...(ossService ? { fileUploader: createOSSFileUploader(ossService) } : {}),
  });
}

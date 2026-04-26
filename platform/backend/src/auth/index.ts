/**
 * 认证引擎装配工厂
 *
 * 将 @ventostack/auth 的各个独立引擎组合为可注入 system module 的依赖集合。
 * 每个引擎保持独立，不互相耦合——组合发生在工厂函数中。
 */

import {
  createJWT,
  createPasswordHasher,
  createRBAC,
  createRowFilter,
  createTOTP,
  createSessionManager,
  createMemorySessionStore,
  createMultiDeviceManager,
  createTokenRefresh,
  createMemoryRevocationStore,
  createAuthSessionManager,
} from "@ventostack/auth";
import type {
  JWTManager,
  PasswordHasher,
  RBAC,
  RowFilter,
  TOTPManager,
  SessionManager,
  MultiDeviceManager,
  TokenRefreshManager,
  AuthSessionManager,
} from "@ventostack/auth";
import { env } from "../config";

export interface AuthEngines {
  jwt: JWTManager;
  jwtSecret: string;
  passwordHasher: PasswordHasher;
  rbac: RBAC;
  rowFilter: RowFilter;
  totp: TOTPManager;
  sessionManager: SessionManager;
  deviceManager: MultiDeviceManager;
  tokenRefresh: TokenRefreshManager;
  authSessionManager: AuthSessionManager;
}

/**
 * 装配完整的认证引擎集合
 */
export function assembleAuthEngines(): AuthEngines {
  const jwtSecret = env.JWT_SECRET;

  // ---- 核心引擎 ----
  const jwt = createJWT({ secret: jwtSecret });
  const passwordHasher = createPasswordHasher();
  const rbac = createRBAC();
  const rowFilter = createRowFilter();

  // ---- 双因素认证 ----
  const totp = createTOTP({ algorithm: "SHA-256" });

  // ---- Session ----
  const sessionStore = createMemorySessionStore();
  const sessionManager = createSessionManager(sessionStore, {
    ttl: env.SESSION_TTL_SECONDS,
  });

  // ---- 多设备管理 ----
  const deviceManager = createMultiDeviceManager({
    maxDevices: env.MAX_DEVICES_PER_USER,
    overflowStrategy: "kickOldest",
  });

  // ---- Token 刷新与吊销 ----
  const revocationStore = createMemoryRevocationStore();
  const tokenRefresh = createTokenRefresh(jwt, { revocationStore });

  // ---- 统一认证会话管理 ----
  const authSessionManager = createAuthSessionManager({
    sessionManager,
    deviceManager,
    tokenRefresh,
    jwt,
  });

  return {
    jwt,
    jwtSecret,
    passwordHasher,
    rbac,
    rowFilter,
    totp,
    sessionManager,
    deviceManager,
    tokenRefresh,
    authSessionManager,
  };
}

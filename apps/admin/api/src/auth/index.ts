/**
 * 认证引擎装配工厂
 *
 * 将 @ventostack/auth 的各个独立引擎组合为可注入 system module 的依赖集合。
 * 每个引擎保持独立，不互相耦合——组合发生在工厂函数中。
 *
 * 当传入 Redis 客户端时，Session 和 Token 吊销存储自动切换为 Redis 实现，
 * 支持多实例分布式部署。
 */

import {
  createJWT,
  createPasswordHasher,
  createRBAC,
  createRowFilter,
  createTOTP,
  createSessionManager,
  createMemorySessionStore,
  createRedisSessionStore,
  createMultiDeviceManager,
  createTokenRefresh,
  createMemoryRevocationStore,
  createRedisRevocationStore,
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
import type { RedisClientInstance } from "@ventostack/cache";
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
 * @param redisClient 可选的 Redis 客户端，传入时 Session 和吊销存储使用 Redis 实现
 */
export function assembleAuthEngines(redisClient?: RedisClientInstance): AuthEngines {
  const jwtSecret = env.JWT_SECRET;

  // ---- 核心引擎 ----
  const jwt = createJWT({ secret: jwtSecret });
  const passwordHasher = createPasswordHasher();
  const rbac = createRBAC();
  const rowFilter = createRowFilter();

  // ---- 双因素认证 ----
  const totp = createTOTP({ algorithm: "SHA-256" });

  // ---- Session（Redis 优先，内存兜底） ----
  const sessionStore = redisClient
    ? createRedisSessionStore({ client: redisClient })
    : createMemorySessionStore();
  const sessionManager = createSessionManager(sessionStore, {
    ttl: env.SESSION_TTL_SECONDS,
  });

  // ---- 多设备管理 ----
  const deviceManager = createMultiDeviceManager({
    maxDevices: env.MAX_DEVICES_PER_USER,
    overflowStrategy: "kick-oldest",
  });

  // ---- Token 刷新与吊销（Redis 优先，内存兜底） ----
  const revocationStore = redisClient
    ? createRedisRevocationStore(redisClient)
    : createMemoryRevocationStore();
  const tokenRefresh = createTokenRefresh(jwt, { revocationStore });

  // ---- 统一认证会话管理 ----
  const authSessionManager = createAuthSessionManager({
    sessionManager,
    deviceManager,
    tokenRefresh,
    jwt,
    jwtSecret,
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

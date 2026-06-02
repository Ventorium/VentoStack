/**
 * @ventostack/auth - 认证授权模块统一导出
 *
 * 提供完整的认证与授权能力，包括：
 * - JWT 签发与验证（createJWT）
 * - 密码哈希（createPasswordHasher）
 * - Session 管理（createSessionManager / createMemorySessionStore）
 * - API Key 管理（createApiKeyManager）
 * - RBAC 基于角色的访问控制（createRBAC）
 * - ABAC 基于属性的访问控制（createABAC）
 * - TOTP 双因素认证（createTOTP）
 * - OAuth2/OIDC 客户端（createOAuth）
 * - Token 刷新与吊销（createTokenRefresh）
 * - 多端登录管理（createMultiDeviceManager）
 * - 策略引擎（createPolicyEngine）
 * - 行级数据过滤（createRowFilter）
 *
 * 安全原则：默认 deny、算法白名单、密钥最小长度、恒定时间比较、Access/Refresh 分离。
 */

/** JWT 管理 - 基于 Web Crypto API 的签发与验证 */
export { createJWT } from "./jwt";
export type { JWTAlgorithm, JWTPayload, JWTOptions, JWTManager, JWTConfig } from "./jwt";

/** 密码哈希 - 基于 Bun.password 的 bcrypt 实现 */
export { createPasswordHasher } from "./password";
export type { PasswordHasher, PasswordHasherOptions } from "./password";

/** Session 管理 - 支持内存存储、Redis 存储与自定义 Store */
export { createSessionManager, createMemorySessionStore } from "./session";
export { createRedisSessionStore } from "./redis-session-store";
export type {
  Session,
  SessionOptions,
  SessionStore,
  SessionManager,
} from "./session";
export type {
  RedisSessionClientLike,
  RedisSessionStoreOptions,
} from "./redis-session-store";

/** API Key 管理 - 生成、哈希与恒定时间验证 */
export { createApiKeyManager } from "./api-key";
export type { ApiKeyManager } from "./api-key";

/** 基于角色的访问控制（RBAC）- 默认 deny，必须显式授权 */
export { createRBAC } from "./rbac";
export type { RBAC, Role, Permission } from "./rbac";

/** Token 刷新与吊销 - Access Token 与 Refresh Token 分离 */
export { createTokenRefresh } from "./token-refresh";
export type {
  TokenPair,
  TokenRefreshManager,
  TokenRefreshOptions,
} from "./token-refresh";

/** Token 吊销存储 - 支持内存与 Redis 实现 */
export { createMemoryRevocationStore, createRedisRevocationStore } from "./token-revocation-store";
export type {
  TokenRevocationStore,
  RedisRevocationClientLike,
} from "./token-revocation-store";

/** 统一认证会话管理 - 聚合 Session、设备、Token 能力 */
export { createAuthSessionManager } from "./auth-session";
export type { AuthSessionManager } from "./auth-session";

/** 基于属性的访问控制（ABAC）- 默认 deny，deny 优先于 allow */
export { createABAC } from "./abac";
export type { ABAC, Policy, PolicyCondition } from "./abac";

/** TOTP 双因素认证 - 基于 RFC 6238/4226 实现 */
export { createTOTP } from "./totp";
export type { TOTPManager, TOTPOptions } from "./totp";

/** OAuth2/OIDC 客户端 - 支持 GitHub/Google 等标准提供商 */
export { createOAuth } from "./oauth";
export type {
  OAuthManager,
  OAuthProvider,
  OAuthTokenResponse,
  OAuthUserInfo,
} from "./oauth";

/** 多端登录管理 - 设备数量限制与溢出策略 */
export { createMultiDeviceManager } from "./multi-device";
export type { MultiDeviceManager, DeviceSession, MultiDeviceOptions } from "./multi-device";

/** 策略引擎 - 类 Casbin 的策略模型，支持通配符匹配与条件表达式 */
export { createPolicyEngine } from "./policy-engine";
export type {
  PolicyEngine,
  PolicyRule,
  PolicyEvalContext,
  PolicyConditionDef,
} from "./policy-engine";

/** 行级数据过滤 - 根据用户/租户上下文自动生成 WHERE 条件 */
export { createRowFilter } from "./row-filter";
export type { RowFilter, RowFilterRule, RowFilterContext, ParameterizedClause } from "./row-filter";

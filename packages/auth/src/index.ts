// @aeron/auth
export { createJWT } from "./jwt";
export type { JWTAlgorithm, JWTPayload, JWTOptions, JWTManager } from "./jwt";
export { createSessionManager, createMemorySessionStore } from "./session";
export type {
  Session,
  SessionOptions,
  SessionStore,
  SessionManager,
} from "./session";
export { createApiKeyManager } from "./api-key";
export type { ApiKeyManager } from "./api-key";
export { createRBAC } from "./rbac";
export type { RBAC, Role, Permission } from "./rbac";
export { createTokenRefresh } from "./token-refresh";
export type {
  TokenPair,
  TokenRefreshManager,
  TokenRefreshOptions,
} from "./token-refresh";
export { createABAC } from "./abac";
export type { ABAC, Policy, PolicyCondition } from "./abac";
export { createTOTP } from "./totp";
export type { TOTPManager, TOTPOptions } from "./totp";
export { createOAuth } from "./oauth";
export type {
  OAuthManager,
  OAuthProvider,
  OAuthTokenResponse,
  OAuthUserInfo,
} from "./oauth";

export { createMultiDeviceManager } from "./multi-device";
export type { MultiDeviceManager, DeviceSession, MultiDeviceOptions } from "./multi-device";

export { createPolicyEngine } from "./policy-engine";
export type { PolicyEngine, PolicyRule, PolicyEvalContext, PolicyConditionDef } from "./policy-engine";

export { createRowFilter } from "./row-filter";
export type { RowFilter, RowFilterRule, RowFilterContext } from "./row-filter";

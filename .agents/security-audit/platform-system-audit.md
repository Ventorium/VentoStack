# Platform System Module Security Audit
## 1. Auth Guard Middleware
```typescript
/**
 * @ventostack/system - 认证与权限中间件
 * 提供基于 JWT 的认证中间件与基于 RBAC 的权限校验中间件
 */

import type { JWTManager } from "@ventostack/auth";
import type { RBAC } from "@ventostack/auth";
import type { Middleware } from "@ventostack/core";

/** 认证后的用户信息（注入到 ctx.user） */
export interface AuthUser {
  id: string;
  roles: string[];
  username: string;
}

/** 超级管理员角色代码，拥有所有权限 */
const SUPER_ADMIN_ROLE = "admin";

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

/**
 * 创建认证中间件
 * 从 Authorization 头提取 Bearer Token，验证 JWT 并将用户信息注入 ctx.user
 *
 * @param jwt JWT 管理器实例
 * @param secret JWT 签名密钥
 * @returns Middleware 实例
 */
export function createAuthMiddleware(jwt: JWTManager, secret: string): Middleware {
  return async (ctx, next) => {
    const authHeader = ctx.request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ code: 401, message: "缺少认证令牌" }), {
        status: 401,
        headers: JSON_HEADERS,
      });
    }

    const token = authHeader.slice(7);
    try {
      const payload = await jwt.verify(token, secret);
      ctx.user = {
        id: payload.sub ?? "",
        roles: ((payload as Record<string, unknown>).roles as string[]) ?? [],
        username: ((payload as Record<string, unknown>).username as string) ?? "",
      } satisfies AuthUser;
      return next();
    } catch {
      return new Response(JSON.stringify({ code: 401, message: "无效的认证令牌" }), {
        status: 401,
        headers: JSON_HEADERS,
      });
    }
  };
}

/**
 * 创建权限校验中间件工厂
 * 返回一个函数，该函数接受 resource 和 action 参数，生成对应的权限校验中间件
 *
 * @param rbac RBAC 管理器实例
 * @returns 权限校验中间件工厂函数
 */
export function createPermMiddleware(rbac: RBAC): (resource: string, action: string) => Middleware {
  return (resource: string, action: string): Middleware => {
    return async (ctx, next) => {
      const user = ctx.user as AuthUser | undefined;
      if (!user) {
        return new Response(JSON.stringify({ code: 401, message: "未登录" }), {
          status: 401,
          headers: JSON_HEADERS,
        });
      }

      // 超级管理员跳过权限检查
      if (user.roles.includes(SUPER_ADMIN_ROLE)) {
        return next();
      }

      const allowed = user.roles.some((role) => rbac.hasPermission(role, resource, action));
      if (!allowed) {
        return new Response(
          JSON.stringify({ code: 403, message: `无权限：${resource}:${action}` }),
          { status: 403, headers: JSON_HEADERS },
        );
      }

      return next();
    };
  };
}
```
## 2. Operation Log Middleware
```typescript
/**
 * @ventostack/system - 操作日志中间件
 * 记录写操作的审计日志，自动脱敏敏感字段，异步写入不阻塞响应
 * 同时写入内存审计链和数据库持久化表
 */

import type { Middleware } from "@ventostack/core";
import type { AuditStore } from "@ventostack/observability";

/** 操作日志中间件配置 */
export interface OperationLogOptions {
  /** 排除的路径前缀列表（不记录日志） */
  excludePaths?: string[];
  /** 排除的路径前缀列表（用于匹配以该前缀开头的路径） */
  excludePathPrefixes?: string[];
  /** 需要脱敏的字段名（不区分大小写） */
  sensitiveFields?: string[];
  /** 将日志写入数据库的函数 */
  saveToDb?: (entry: OperationLogEntry) => Promise<void>;
}

/** 写入数据库的操作日志条目 */
export interface OperationLogEntry {
  id: string;
  user_id: string | null;
  username: string;
  module: string;
  action: string;
  method: string;
  url: string;
  ip: string;
  params: string | null;
  result: number;
  error_msg: string | null;
  duration: number;
  created_at: Date;
}

/** 默认需要脱敏的字段 */
const DEFAULT_SENSITIVE_FIELDS = [
  "password",
  "passwordHash",
  "password_hash",
  "token",
  "secret",
  "key",
  "cookie",
  "authorization",
  "phone",
  "email",
  "idcard",
  "mfaSecret",
  "mfa_secret",
];

/** URL 路径前缀 → 模块中文名映射 */
const MODULE_MAP: Array<{ prefix: string; name: string }> = [
  { prefix: "/api/system/users", name: "用户管理" },
  { prefix: "/api/system/roles", name: "角色管理" },
  { prefix: "/api/system/menus", name: "菜单管理" },
  { prefix: "/api/system/depts", name: "部门管理" },
  { prefix: "/api/system/posts", name: "岗位管理" },
  { prefix: "/api/system/dict", name: "字典管理" },
  { prefix: "/api/system/configs", name: "参数配置" },
  { prefix: "/api/system/notices", name: "通知公告" },
  { prefix: "/api/system/login-logs", name: "登录日志" },
  { prefix: "/api/system/operation-logs", name: "操作日志" },
  { prefix: "/api/system/monitor", name: "系统监控" },
  { prefix: "/api/system/user", name: "个人中心" },
  { prefix: "/api/auth", name: "认证管理" },
  { prefix: "/api/system/scheduler", name: "定时任务" },
  { prefix: "/api/system/oss", name: "文件管理" },
  { prefix: "/api/system/gen", name: "代码生成" },
  { prefix: "/api/system/notification", name: "消息通知" },
];

/**
 * 根据 URL 路径推断模块名称
 * 匹配最长前缀，未匹配则返回 "其他"
 */
function resolveModule(path: string): string {
  let matched = "";
  let moduleName = "其他";
  for (const entry of MODULE_MAP) {
    if (path.startsWith(entry.prefix) && entry.prefix.length > matched.length) {
      matched = entry.prefix;
      moduleName = entry.name;
    }
  }
  return moduleName;
}

/**
 * 从请求中提取客户端 IP
 * 优先读取 x-forwarded-for（取第一个），其次 x-real-ip，兜底 "unknown"
 */
function extractClientIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for 可能包含多个 IP，取第一个（最左边的是原始客户端）
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIP = request.headers.get("x-real-ip");
  if (realIP) return realIP.trim();
  return "unknown";
}

/**
 * 递归脱敏对象中的敏感字段
 * @param obj 原始对象
 * @param sensitiveSet 敏感字段集合
 * @returns 脱敏后的对象
 */
function sanitize(obj: unknown, sensitiveSet: Set<string>): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((item) => sanitize(item, sensitiveSet));

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (sensitiveSet.has(key.toLowerCase())) {
      result[key] = "******";
    } else if (typeof value === "object" && value !== null) {
      result[key] = sanitize(value, sensitiveSet);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * 创建操作日志中间件
 *
 * 跳过 GET / HEAD / OPTIONS 请求，仅记录写操作。
 * 读取请求中的用户、方法、URL、IP、Body 信息，
 * 对 Body 中的敏感字段进行脱敏后异步写入审计日志。
 *
 * 同时写入内存审计链（AuditStore）和数据库持久化表。
 *
 * @param auditLog 审计日志存储实例
 * @param options 配置选项
 * @returns Middleware 实例
 */
export function createOperationLogMiddleware(
  auditLog: AuditStore,
  options?: OperationLogOptions,
): Middleware {
  const excludePaths = new Set(options?.excludePaths ?? []);
  const excludePrefixes = options?.excludePathPrefixes ?? [];
  const sensitiveSet = new Set([
    ...DEFAULT_SENSITIVE_FIELDS,
    ...(options?.sensitiveFields ?? []).map((f) => f.toLowerCase()),
  ]);
  const saveToDb = options?.saveToDb;

  return async (ctx, next) => {
    const method = ctx.method.toUpperCase();

    // 跳过读操作
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      return next();
    }

    // 跳过排除路径（精确匹配）
    if (excludePaths.has(ctx.path)) {
      return next();
    }

    // 跳过排除路径（前缀匹配）
    for (const prefix of excludePrefixes) {
      if (ctx.path.startsWith(prefix)) {
        return next();
      }
    }

    // 提取请求信息
    const user = ctx.user as { id?: string; username?: string } | undefined;
    const actor = user?.username ?? user?.id ?? "anonymous";
    const startTime = Date.now();
    const clientIP = extractClientIP(ctx.request);
    const module = resolveModule(ctx.path);

    // 读取并脱敏请求体
    let sanitizedBody: unknown = null;
    try {
      const body = ctx.body;
      if (
        body &&
        typeof body === "object" &&
        Object.keys(body as Record<string, unknown>).length > 0
      ) {
        sanitizedBody = sanitize(body, sensitiveSet);
      }
    } catch {
      sanitizedBody = null;
    }

    // 执行后续处理
    let responseStatus = 200;
    let errorMsg: string | null = null;
    try {
      const response = await next();
      responseStatus = response.status;
      return response;
    } catch (err) {
      responseStatus = 500;
      errorMsg = err instanceof Error ? err.message : "Unknown error";
      throw err;
    } finally {
      const duration = Date.now() - startTime;
      const resultValue = responseStatus < 400 ? 1 : 0;
      const paramsStr = sanitizedBody ? JSON.stringify(sanitizedBody) : null;

      // 异步写入内存审计链，不阻塞响应
      auditLog
        .append({
          actor,
          action: `${method} ${ctx.path}`,
          resource: "operation",
          result: responseStatus < 400 ? "success" : "failure",
          metadata: {
            method,
            url: ctx.path,
            duration,
            status: responseStatus,
            ...(sanitizedBody ? { body: sanitizedBody } : {}),
            ...(errorMsg ? { errorMsg } : {}),
          },
        })
        .catch(() => {
          // 审计日志写入失败不应影响已发出的响应
        });

      // 异步写入数据库持久化表，不阻塞响应
      if (saveToDb) {
        const dbEntry: OperationLogEntry = {
          id: crypto.randomUUID(),
          user_id: user?.id ?? null,
          username: actor,
          module,
          action: `${method} ${ctx.path}`,
          method,
          url: ctx.path,
          ip: clientIP,
          params: paramsStr,
          result: resultValue,
          error_msg: errorMsg,
          duration,
          created_at: new Date(),
        };
        saveToDb(dbEntry).catch(() => {
          // 数据库写入失败不应影响已发出的响应
        });
      }
    }
  };
}
```
## 3. Auth Service
```typescript
/**
 * @ventostack/system - AuthService
 * 认证服务：登录、登出、密码重置、MFA 管理
 * 默认安全：速率限制、失败锁定、恒定时间密码校验
 */

import type { JWTManager } from "@ventostack/auth";
import type { PasswordHasher } from "@ventostack/auth";
import type { TOTPManager } from "@ventostack/auth";
import type { AuthSessionManager } from "@ventostack/auth";
import type { Cache } from "@ventostack/cache";
import type { Database } from "@ventostack/database";
import type { EventBus } from "@ventostack/events";
import type { AuditStore } from "@ventostack/observability";
import { LoginLogModel } from "../models/log";
import { RoleModel, UserRoleModel } from "../models/role";
import { UserModel } from "../models/user";
import type { ConfigService } from "./config";
import { validatePassword } from "./password-policy";

/** 登录结果 */
export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
  sessionId: string;
  mfaRequired: boolean;
  mfaToken?: string;
  mfaSetupRequired?: boolean;
}

/** MFA 设置结果 */
export interface MFASetupResult {
  secret: string;
  qrCodeUri: string;
  recoveryCodes: string[];
}

/** 认证服务接口 */
export interface AuthService {
  login(params: {
    username: string;
    password: string;
    ip: string;
    userAgent: string;
    deviceType?: string;
  }): Promise<LoginResult>;
  logout(userId: string, sessionId: string, refreshTokenJti?: string): Promise<void>;
  refreshToken(oldRefreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    refreshExpiresIn: number;
  }>;
  register(params: {
    username: string;
    password: string;
    email?: string;
    phone?: string;
  }): Promise<{ userId: string }>;
  forgotPassword(email: string): Promise<{ resetToken: string }>;
  resetPasswordByToken(token: string, newPassword: string): Promise<void>;
  resetPassword(userId: string, newPassword: string): Promise<void>;
  forceLogout(userId: string): Promise<{ sessions: number; devices: number }>;
  enableMFA(userId: string): Promise<MFASetupResult>;
  verifyMFA(userId: string, code: string): Promise<boolean>;
  disableMFA(userId: string, code: string): Promise<void>;
  recoverMFA(userId: string, recoveryCode: string): Promise<{ tempToken: string }>;
  completeMFALogin(
    mfaToken: string,
    code: string,
    ip: string,
    userAgent: string,
    deviceType?: string,
  ): Promise<LoginResult>;
  completePasskeyLogin(params: {
    userId: string;
    username: string;
    ip: string;
    userAgent: string;
    deviceType?: string;
  }): Promise<LoginResult>;
}

/** 登录失败最大次数（默认值，实际从 sys_config 读取） */
const DEFAULT_MAX_LOGIN_FAILURES = 5;
/** 账户锁定时长分钟数（默认值，实际从 sys_config 读取） */
const DEFAULT_LOCK_MINUTES = 15;
/** IP 每分钟最大请求次数 */
const MAX_IP_REQUESTS_PER_MINUTE = 20;
/** IP 限流窗口（秒） */
const IP_RATE_WINDOW = 60;
/** MFA 临时 token 有效期（秒） */
const MFA_TOKEN_TTL = 300;
/** 密码重置 token 有效期（秒） */
const RESET_TOKEN_TTL = 1800;

/** 查询用户角色代码列表 */
async function getUserRoleCodes(db: Database, userId: string): Promise<string[]> {
  const userRoles = await db
    .query(UserRoleModel)
    .where("user_id", "=", userId)
    .select("role_id")
    .list();
  if (userRoles.length === 0) return [];
  const roleIds = userRoles.map((r) => r.role_id);
  const roles = await db
    .query(RoleModel)
    .where("id", "IN", roleIds)
    .where("status", "=", 1)
    .select("code")
    .list();
  return roles.map((r) => r.code);
}

/**
 * 创建认证服务实例
 * @param deps 依赖项
 * @returns 认证服务实例
 */
export function createAuthService(deps: {
  db: Database;
  cache: Cache;
  jwt: JWTManager;
  passwordHasher: PasswordHasher;
  totp: TOTPManager;
  authSessionManager: AuthSessionManager;
  auditStore: AuditStore;
  jwtSecret: string;
  eventBus: EventBus;
  configService: ConfigService;
}): AuthService {
  const {
    db,
    cache,
    jwt,
    passwordHasher,
    totp,
    authSessionManager,
    auditStore,
    jwtSecret,
    eventBus,
    configService,
  } = deps;

  /** 解析 User-Agent 中的浏览器和 OS */
  function parseUA(ua: string): { browser: string; os: string } {
    let browser = "Unknown";
    let os = "Unknown";
    if (/Edg\//.test(ua)) browser = "Edge";
    else if (/Chrome\//.test(ua)) browser = "Chrome";
    else if (/Firefox\//.test(ua)) browser = "Firefox";
    else if (/Safari\//.test(ua)) browser = "Safari";
    if (/Windows NT/.test(ua)) os = "Windows";
    else if (/Mac OS X/.test(ua)) os = "macOS";
    else if (/Linux/.test(ua)) os = "Linux";
    else if (/Android/.test(ua)) os = "Android";
    else if (/iPhone|iPad/.test(ua)) os = "iOS";
    return { browser, os };
  }

  /** 写入登录日志 */
  async function recordLoginLog(params: {
    userId?: string;
    username: string;
    ip: string;
    userAgent: string;
    status: number;
    message: string;
    loginMethod?: string;
  }) {
    const { browser, os } = parseUA(params.userAgent);
    const method = params.loginMethod ?? "password";
    await db.query(LoginLogModel).insert({
      id: crypto.randomUUID(),
      user_id: params.userId ?? null,
      username: params.username,
      ip: params.ip,
      browser,
      os,
      status: params.status,
      message: params.message,
      login_method: method,
      login_at: new Date(),
      created_at: new Date(),
    });
  }

  return {
    async login(params) {
      const { username, password, ip, userAgent, deviceType } = params;

      // 1. 读取配置
      const maxAttempts =
        Number(await configService.getValue("sys_login_max_attempts")) ||
        DEFAULT_MAX_LOGIN_FAILURES;
      const lockMinutes =
        Number(await configService.getValue("sys_login_lock_minutes")) || DEFAULT_LOCK_MINUTES;

      // 2. 检查账号锁定（按 IP + 用户名组合）
      const failKey = `login_fail:${ip}:${username}`;
      const failCount = await cache.get<number>(failKey);
      if (failCount !== null && failCount >= maxAttempts) {
        await auditStore.append({
          actor: username,
          action: "login.locked",
          resource: "auth",
          result: "denied",
          metadata: { ip, reason: "account_locked" },
        });
        await recordLoginLog({ username, ip, userAgent, status: 0, message: "账号已锁定" });
        throw new Error("账号登录失败次数过多，已锁定");
      }

      // 3. 检查 IP 速率限制
      const ipKey = `login_ip:${ip}`;
      const ipCount = await cache.get<number>(ipKey);
      if (ipCount !== null && ipCount >= MAX_IP_REQUESTS_PER_MINUTE) {
        await auditStore.append({
          actor: ip,
          action: "login.rate_limited",
          resource: "auth",
          result: "denied",
          metadata: { ip, reason: "ip_rate_limited" },
        });
        await recordLoginLog({ username, ip, userAgent, status: 0, message: "请求过于频繁" });
        throw new Error("请求过于频繁");
      }

      // 递增 IP 计数
      const currentIpCount = (ipCount ?? 0) + 1;
      await cache.set(ipKey, currentIpCount, { ttl: IP_RATE_WINDOW });

      // 3. 查询用户
      const user = await db
        .query(UserModel)
        .where("username", "=", username)
        .select(
          "id",
          "username",
          "password_hash",
          "status",
          "mfa_enabled",
          "mfa_secret",
          "blacklisted",
          "locked_until",
          "login_attempts",
          "password_changed_at",
        )
        .get();

      if (!user) {
        // 用户不存在，仍然递增失败计数防止枚举探测
        await cache.set(failKey, (failCount ?? 0) + 1, { ttl: 900 });
        await auditStore.append({
          actor: username,
          action: "login.failed",
          resource: "auth",
          result: "failure",
          metadata: { ip, reason: "user_not_found" },
        });
        await recordLoginLog({ username, ip, userAgent, status: 0, message: "用户不存在" });
        throw new Error("用户名或密码错误");
      }

      // 4. 检查用户状态
      if (user.status !== 1) {
        await auditStore.append({
          actor: username,
          action: "login.disabled",
          resource: "auth",
          result: "denied",
          metadata: { ip, userId: user.id, reason: "account_disabled" },
        });
        await recordLoginLog({
          userId: user.id,
          username,
          ip,
          userAgent,
          status: 0,
          message: "账号已禁用",
        });
        throw new Error("账号已禁用");
      }

      // 5. 检查黑名单
      if (user.blacklisted) {
        await auditStore.append({
          actor: username,
          action: "login.blacklisted",
          resource: "auth",
          result: "denied",
          metadata: { ip, userId: user.id, reason: "account_blacklisted" },
        });
        await recordLoginLog({
          userId: user.id,
          username,
          ip,
          userAgent,
          status: 0,
          message: "账号已被拉黑",
        });
        throw new Error("账号已被拉黑");
      }

      // 6. 检查 DB-based 锁定
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        await auditStore.append({
          actor: username,
          action: "login.locked_db",
          resource: "auth",
          result: "denied",
          metadata: {
            ip,
            userId: user.id,
            reason: "account_locked_db",
            lockedUntil: user.locked_until,
          },
        });
        await recordLoginLog({
          userId: user.id,
          username,
          ip,
          userAgent,
          status: 0,
          message: "账号已被锁定",
        });
        throw new Error("账号已被锁定");
      }

      // 7. 清除过期锁定
      if (user.locked_until && new Date(user.locked_until) <= new Date()) {
        await db
          .query(UserModel)
          .where("id", "=", user.id)
          .update({ locked_until: null, login_attempts: 0 });
      }

      // 8. 校验密码
      const valid = await passwordHasher.verify(password, user.password_hash);
      if (!valid) {
        // 9. 密码错误：递增失败计数（缓存 + DB）
        const newFailCount = (failCount ?? 0) + 1;
        await cache.set(failKey, newFailCount, { ttl: lockMinutes * 60 });
        await db.raw(
          `UPDATE sys_user SET login_attempts = COALESCE(login_attempts, 0) + 1 WHERE id = $1`,
          [user.id],
        );

        await auditStore.append({
          actor: username,
          action: "login.failed",
          resource: "auth",
          result: "failure",
          metadata: { ip, userId: user.id, reason: "wrong_password", failCount: newFailCount },
        });
        await recordLoginLog({
          userId: user.id,
          username,
          ip,
          userAgent,
          status: 0,
          message: "密码错误",
        });

        throw new Error("用户名或密码错误");
      }

      // 10. 登录成功：清除失败计数（缓存 + DB）
      await cache.del(failKey);
      await db.query(UserModel).where("id", "=", user.id).update({ login_attempts: 0 });

      // 11. 检查密码是否过期
      const expireDays = Number(await configService.getValue("sys_password_expire_days")) ?? 30;
      if (expireDays !== -1 && user.password_changed_at) {
        const expiredAt = new Date(user.password_changed_at);
        expiredAt.setDate(expiredAt.getDate() + expireDays);
        if (expiredAt < new Date()) {
          const tempToken = await jwt.sign(
            { sub: user.id, iss: "password-expired", username: user.username },
            jwtSecret,
            { expiresIn: 600 },
          );
          await recordLoginLog({
            userId: user.id,
            username,
            ip,
            userAgent,
            status: 0,
            message: "密码已过期",
          });
          const err = new Error("密码已过期") as Error & {
            code: string;
            data: { tempToken: string };
          };
          err.code = "password_expired";
          err.data = { tempToken };
          throw err;
        }
      }

      // 12. 检查是否需要 MFA（受全局配置控制）
      const mfaGloballyEnabled = (await configService.getValue("sys_mfa_enabled")) !== "false";
      if (mfaGloballyEnabled && user.mfa_enabled) {
        const mfaToken = await jwt.sign(
          { sub: user.id, iss: "mfa-pending", username: user.username },
          jwtSecret,
          { expiresIn: MFA_TOKEN_TTL },
        );

        await auditStore.append({
          actor: username,
          action: "login.mfa_required",
          resource: "auth",
          result: "success",
          metadata: { ip, userId: user.id },
        });
        await recordLoginLog({
          userId: user.id,
          username,
          ip,
          userAgent,
          status: 1,
          message: "需要MFA验证",
        });

        return {
          accessToken: "",
          refreshToken: "",
          expiresIn: 0,
          refreshExpiresIn: 0,
          sessionId: "",
          mfaRequired: true,
          mfaToken,
        };
      }

      // 13. 调用统一会话管理器完成登录
      const roleCodes = await getUserRoleCodes(db, user.id);
      const sessionResult = await authSessionManager.login({
        userId: user.id,
        device: {
          sessionId: "",
          userId: user.id,
          deviceType: deviceType ?? "web",
          deviceName: userAgent,
        },
        tokenPayload: {
          username: user.username,
          roles: roleCodes,
        },
      });

      await auditStore.append({
        actor: username,
        action: "login.success",
        resource: "auth",
        result: "success",
        metadata: { ip, userId: user.id, sessionId: sessionResult.sessionId },
      });
      await recordLoginLog({
        userId: user.id,
        username,
        ip,
        userAgent,
        status: 1,
        message: "登录成功",
        loginMethod: "password",
      });

      // 检查是否需要提示用户设置 MFA（全局启用 + 强制 + 用户未配置）
      const mfaForce = (await configService.getValue("sys_mfa_force")) === "true";
      const mfaSetupRequired = mfaGloballyEnabled && mfaForce && !user.mfa_enabled;

      return {
        accessToken: sessionResult.accessToken,
        refreshToken: sessionResult.refreshToken,
        expiresIn: sessionResult.expiresIn,
        refreshExpiresIn: sessionResult.refreshExpiresIn,
        sessionId: sessionResult.sessionId,
        mfaRequired: false,
        mfaSetupRequired,
      };
    },

    async logout(userId, sessionId, refreshTokenJti) {
      await authSessionManager.logout(userId, sessionId, refreshTokenJti);

      await auditStore.append({
        actor: userId,
        action: "logout",
        resource: "auth",
        result: "success",
        metadata: { sessionId },
      });
    },

    async refreshToken(oldRefreshToken) {
      const pair = await authSessionManager.refreshTokens(oldRefreshToken, jwtSecret);

      return {
        accessToken: pair.accessToken,
        refreshToken: pair.refreshToken,
        expiresIn: pair.expiresIn,
        refreshExpiresIn: pair.refreshExpiresIn,
      };
    },

    async register(params) {
      const { username, password, email, phone } = params;
      const id = crypto.randomUUID();
      const passwordHash = await passwordHasher.hash(password);

      await db.query(UserModel).insert({
        id,
        username,
        password_hash: passwordHash,
        email: email ?? null,
        phone: phone ?? null,
        status: 1,
        mfa_enabled: false,
      });

      await auditStore.append({
        actor: "system",
        action: "user.register",
        resource: "user",
        resourceId: id,
        result: "success",
        metadata: { username },
      });

      return { userId: id };
    },

    async forgotPassword(email) {
      // 按 email 查找用户
      const user = await db
        .query(UserModel)
        .where("email", "=", email)
        .where("status", "=", 1)
        .select("id", "username", "email")
        .get();

      // 即使找不到用户也返回成功，防止邮箱枚举
      if (!user) {
        await auditStore.append({
          actor: email,
          action: "password.forgot",
          resource: "auth",
          result: "failure",
          metadata: { email },
        });
        // 返回一个无效 token，调用方无法区分
        const dummyToken = crypto.randomUUID();
        return { resetToken: dummyToken };
      }

      const resetToken = crypto.randomUUID();
      const cacheKey = `pwd_reset:${resetToken}`;

      // 将 token 存入缓存，关联 userId
      await cache.set(cacheKey, user.id, { ttl: RESET_TOKEN_TTL });

      await auditStore.append({
        actor: user.id,
        action: "password.forgot",
        resource: "auth",
        resourceId: user.id,
        result: "success",
        metadata: { email, username: user.username },
      });

      // 触发事件，通知层可监听并发送邮件
      await eventBus.emit("auth.password.reset_requested" as any, {
        userId: user.id,
        email,
        username: user.username,
        resetToken,
        expiresIn: RESET_TOKEN_TTL,
      });

      return { resetToken };
    },

    async resetPasswordByToken(token, newPassword) {
      const cacheKey = `pwd_reset:${token}`;
      const userId = await cache.get<string>(cacheKey);

      if (!userId) {
        throw new Error("重置令牌无效或已过期");
      }

      // 密码策略校验
      const minLength = Number(await configService.getValue("sys_password_min_length")) || 6;
      const complexity =
        ((await configService.getValue("sys_password_complexity")) as "low" | "medium" | "high") ||
        "low";
      const validation = validatePassword(newPassword, { minLength, complexity });
      if (!validation.valid) {
        throw new Error(validation.message);
      }

      const passwordHash = await passwordHasher.hash(newPassword);

      await db.query(UserModel).where("id", "=", userId).update({
        password_hash: passwordHash,
        password_changed_at: new Date(),
      });

      // 删除已使用的 token
      await cache.del(cacheKey);

      await auditStore.append({
        actor: "system",
        action: "password.reset_by_token",
        resource: "user",
        resourceId: userId,
        result: "success",
      });
    },

    async resetPassword(userId, newPassword) {
      // 密码策略校验
      const minLength = Number(await configService.getValue("sys_password_min_length")) || 6;
      const complexity =
        ((await configService.getValue("sys_password_complexity")) as "low" | "medium" | "high") ||
        "low";
      const validation = validatePassword(newPassword, { minLength, complexity });
      if (!validation.valid) {
        throw new Error(validation.message);
      }

      const passwordHash = await passwordHasher.hash(newPassword);

      await db.query(UserModel).where("id", "=", userId).update({
        password_hash: passwordHash,
        password_changed_at: new Date(),
      });

      await auditStore.append({
        actor: "system",
        action: "user.reset_password",
        resource: "user",
        resourceId: userId,
        result: "success",
      });
    },

    async forceLogout(userId) {
      const result = await authSessionManager.forceLogout(userId);

      await auditStore.append({
        actor: "system",
        action: "user.force_logout",
        resource: "user",
        resourceId: userId,
        result: "success",
        metadata: { sessions: result.sessions, devices: result.devices },
      });

      return result;
    },

    async enableMFA(userId) {
      const secret = totp.generateSecret();
      const qrCodeUri = totp.generateURI(secret, "VentoStack", userId);

      // 生成恢复码
      const recoveryCodes: string[] = [];
      for (let i = 0; i < 8; i++) {
        const bytes = new Uint8Array(4);
        crypto.getRandomValues(bytes);
        const code = Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        recoveryCodes.push(code);
      }

      // 先存储密钥，但暂不启用（需验证后才真正启用）
      await db.query(UserModel).where("id", "=", userId).update({ mfa_secret: secret });

      await auditStore.append({
        actor: userId,
        action: "mfa.setup_initiated",
        resource: "auth",
        resourceId: userId,
        result: "success",
      });

      return { secret, qrCodeUri, recoveryCodes };
    },

    async verifyMFA(userId, code) {
      const mfaUser = await db
        .query(UserModel)
        .where("id", "=", userId)
        .select("mfa_secret", "mfa_enabled")
        .get();

      if (!mfaUser) {
        throw new Error("用户不存在");
      }

      if (!mfaUser.mfa_secret) {
        throw new Error("未配置 MFA");
      }

      const valid = await totp.verifyAndConsume(mfaUser.mfa_secret, code);
      if (!valid) {
        await auditStore.append({
          actor: userId,
          action: "mfa.verify_failed",
          resource: "auth",
          resourceId: userId,
          result: "failure",
        });
        return false;
      }

      // 如果是首次验证，正式启用 MFA
      if (!mfaUser.mfa_enabled) {
        await db.query(UserModel).where("id", "=", userId).update({ mfa_enabled: true });
      }

      await auditStore.append({
        actor: userId,
        action: "mfa.verify_success",
        resource: "auth",
        resourceId: userId,
        result: "success",
      });

      return true;
    },

    async disableMFA(userId, code) {
      const mfaUser = await db.query(UserModel).where("id", "=", userId).select("mfa_secret").get();

      if (!mfaUser) {
        throw new Error("用户不存在");
      }

      if (!mfaUser.mfa_secret) {
        throw new Error("未配置 MFA");
      }

      const valid = await totp.verify(mfaUser.mfa_secret, code);
      if (!valid) {
        await auditStore.append({
          actor: userId,
          action: "mfa.disable_failed",
          resource: "auth",
          resourceId: userId,
          result: "failure",
        });
        throw new Error("MFA 验证码错误");
      }

      await db.query(UserModel).where("id", "=", userId).update({
        mfa_enabled: false,
        mfa_secret: null,
      });

      await auditStore.append({
        actor: userId,
        action: "mfa.disabled",
        resource: "auth",
        resourceId: userId,
        result: "success",
      });
    },

    async recoverMFA(userId, recoveryCode) {
      // 恢复码验证通过后生成临时 token，用户可用此 token 重新设置 MFA
      // 恢复码存储在缓存中进行校验（实际场景可存 DB）
      // 此处简化：生成临时 token 供调用方使用
      const tempToken = await jwt.sign({ sub: userId, iss: "mfa-recovery" }, jwtSecret, {
        expiresIn: 600,
      });

      await db.query(UserModel).where("id", "=", userId).update({
        mfa_enabled: false,
        mfa_secret: null,
      });

      await auditStore.append({
        actor: userId,
        action: "mfa.recovered",
        resource: "auth",
        resourceId: userId,
        result: "success",
      });

      return { tempToken };
    },

    async completeMFALogin(mfaToken, code, ip, userAgent, deviceType) {
      // 1. 验证 MFA 临时 token
      const payload = (await jwt.verify(mfaToken, jwtSecret)) as {
        sub?: string;
        iss?: string;
        username?: string;
      };
      if (!payload.sub || payload.iss !== "mfa-pending") {
        throw new Error("MFA 令牌无效");
      }

      const userId = payload.sub;
      const username = payload.username ?? "";

      // 2. 查询用户的 MFA 密钥
      const mfaUser = await db
        .query(UserModel)
        .where("id", "=", userId)
        .select("mfa_secret", "mfa_enabled")
        .get();
      if (!mfaUser || !mfaUser.mfa_secret) {
        throw new Error("未配置 MFA");
      }

      // 3. 验证 TOTP 码
      const valid = await totp.verifyAndConsume(mfaUser.mfa_secret, code);
      if (!valid) {
        await auditStore.append({
          actor: userId,
          action: "login.mfa_failed",
          resource: "auth",
          result: "failure",
          metadata: { ip },
        });
        throw new Error("MFA 验证码错误");
      }

      // 4. 创建会话，颁发真实 token
      const sessionResult = await authSessionManager.login({
        userId,
        device: {
          sessionId: "",
          userId,
          deviceType: deviceType ?? "web",
          deviceName: userAgent,
        },
        tokenPayload: { username, roles: await getUserRoleCodes(db, userId) },
      });

      await auditStore.append({
        actor: username,
        action: "login.mfa_success",
        resource: "auth",
        result: "success",
        metadata: { ip, userId, sessionId: sessionResult.sessionId },
      });

      return {
        accessToken: sessionResult.accessToken,
        refreshToken: sessionResult.refreshToken,
        expiresIn: sessionResult.expiresIn,
        refreshExpiresIn: sessionResult.refreshExpiresIn,
        sessionId: sessionResult.sessionId,
        mfaRequired: false,
      };
    },

    async completePasskeyLogin(params) {
      const { userId, username, ip, userAgent, deviceType } = params;

      // 校验用户状态
      const passkeyUser = await db
        .query(UserModel)
        .where("id", "=", userId)
        .select("status", "blacklisted", "locked_until")
        .get();
      if (!passkeyUser) throw new Error("用户不存在");
      if (passkeyUser.status !== 1) throw new Error("账号已禁用");
      if (passkeyUser.blacklisted) throw new Error("账号已被拉黑");
      if (passkeyUser.locked_until && new Date(passkeyUser.locked_until) > new Date())
        throw new Error("账号已被锁定");

      const sessionResult = await authSessionManager.login({
        userId,
        device: {
          sessionId: "",
          userId,
          deviceType: deviceType ?? "web",
          deviceName: userAgent,
        },
        tokenPayload: { username, roles: await getUserRoleCodes(db, userId) },
      });

      await recordLoginLog({
        userId,
        username,
        ip,
        userAgent,
        status: 1,
        message: "通行密钥登录成功",
        loginMethod: "passkey",
      });

      await auditStore.append({
        actor: username,
        action: "login.passkey_success",
        resource: "auth",
        result: "success",
        metadata: { ip, userId, sessionId: sessionResult.sessionId },
      });

      return {
        accessToken: sessionResult.accessToken,
        refreshToken: sessionResult.refreshToken,
        expiresIn: sessionResult.expiresIn,
        refreshExpiresIn: sessionResult.refreshExpiresIn,
        sessionId: sessionResult.sessionId,
        mfaRequired: false,
      };
    },
  };
}
```
## 4. User Service
```typescript
/**
 * @ventostack/system - UserService
 * 用户管理服务：创建、更新、删除、查询、密码重置、状态变更
 */

import type { PasswordHasher } from "@ventostack/auth";
import type { Cache } from "@ventostack/cache";
import type { Database } from "@ventostack/database";
import { DeptModel } from "../models/dept";
import { UserModel } from "../models/user";
import type { ConfigService } from "./config";
import { validatePassword } from "./password-policy";

/** 创建用户参数 */
export interface CreateUserParams {
  username: string;
  password: string;
  email?: string;
  phone?: string;
  nickname?: string;
  deptId?: string;
  status?: number;
  remark?: string;
}

/** 更新用户参数 */
export interface UpdateUserParams {
  email?: string;
  phone?: string;
  nickname?: string;
  avatar?: string;
  gender?: number;
  deptId?: string;
  status?: number;
  remark?: string;
}

/** 用户详情 */
export interface UserDetail {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  nickname: string | null;
  avatar: string | null;
  gender: number | null;
  status: number;
  deptId: string | null;
  mfaEnabled: boolean;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 用户列表项 */
export interface UserListItem {
  id: string;
  username: string;
  nickname: string | null;
  email: string | null;
  phone: string | null;
  status: number;
  deptId: string | null;
  createdAt: string;
}

/** 用户列表查询参数 */
export interface UserListParams {
  page?: number;
  pageSize?: number;
  username?: string;
  status?: number;
  deptId?: string;
}

/** 分页结果 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 用户服务接口 */
export interface UserService {
  create(params: CreateUserParams): Promise<{ id: string }>;
  update(id: string, params: UpdateUserParams): Promise<void>;
  delete(id: string): Promise<void>;
  getById(id: string): Promise<UserDetail | null>;
  list(params: UserListParams): Promise<PaginatedResult<UserListItem>>;
  resetPassword(id: string, newPassword: string): Promise<void>;
  updateStatus(id: string, status: number): Promise<void>;
  export(params?: UserListParams): Promise<string>;
}

/**
 * 递归收集指定部门及其所有子部门 ID
 */
async function collectDescendantDeptIds(db: Database, parentId: string): Promise<string[]> {
  const rows = await db.query(DeptModel).select("id", "parent_id").list();

  const childrenMap = new Map<string, string[]>();
  for (const row of rows) {
    const pid = row.parent_id;
    if (pid) {
      const children = childrenMap.get(pid) ?? [];
      children.push(row.id);
      childrenMap.set(pid, children);
    }
  }

  const result: string[] = [parentId];
  const queue = [parentId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of childrenMap.get(current) ?? []) {
      result.push(child);
      queue.push(child);
    }
  }
  return result;
}

/**
 * 创建用户服务实例
 * @param deps 依赖项
 * @returns 用户服务实例
 */
export function createUserService(deps: {
  db: Database;
  passwordHasher: PasswordHasher;
  cache: Cache;
  configService: ConfigService;
}): UserService {
  const { db, passwordHasher, cache, configService } = deps;

  return {
    async create(params) {
      const { username, password, email, phone, nickname, deptId, status, remark } = params;
      const id = crypto.randomUUID();

      // 密码：若未提供则使用系统默认初始密码
      let actualPassword = password;
      if (!actualPassword) {
        actualPassword = (await configService.getValue("sys_user_init_password")) || "123456";
      }

      // 密码策略校验
      const minLength = Number(await configService.getValue("sys_password_min_length")) || 6;
      const complexity =
        ((await configService.getValue("sys_password_complexity")) as "low" | "medium" | "high") ||
        "low";
      const validation = validatePassword(actualPassword, { minLength, complexity });
      if (!validation.valid) {
        throw new Error(validation.message);
      }

      const passwordHash = await passwordHasher.hash(actualPassword);

      await db.query(UserModel).insert({
        id,
        username,
        password_hash: passwordHash,
        email: email ?? null,
        phone: phone ?? null,
        nickname: nickname ?? null,
        dept_id: deptId ?? null,
        status: status ?? 1,
        remark: remark ?? null,
        mfa_enabled: false,
        password_changed_at: new Date(),
      });

      // 清除用户列表缓存
      await cache.del("user:list");

      return { id };
    },

    async update(id, params) {
      const updates: Record<string, unknown> = {};
      if (params.email !== undefined) updates.email = params.email;
      if (params.phone !== undefined) updates.phone = params.phone;
      if (params.nickname !== undefined) updates.nickname = params.nickname;
      if (params.avatar !== undefined) updates.avatar = params.avatar;
      if (params.gender !== undefined) updates.gender = params.gender;
      if (params.deptId !== undefined) updates.dept_id = params.deptId;
      if (params.status !== undefined) updates.status = params.status;
      if (params.remark !== undefined) updates.remark = params.remark;

      if (Object.keys(updates).length === 0) return;

      await db.query(UserModel).where("id", "=", id).update(updates);

      // 清除用户缓存
      await cache.del(`user:detail:${id}`);
      await cache.del("user:list");
    },

    async delete(id) {
      // 软删除
      await db.query(UserModel).where("id", "=", id).delete();

      // 清除缓存
      await cache.del(`user:detail:${id}`);
      await cache.del("user:list");
    },

    async getById(id) {
      // 尝试从缓存获取
      const cached = await cache.get<UserDetail>(`user:detail:${id}`);
      if (cached) return cached;

      const row = await db
        .query(UserModel)
        .where("id", "=", id)
        .select(
          "id",
          "username",
          "email",
          "phone",
          "nickname",
          "avatar",
          "gender",
          "status",
          "dept_id",
          "mfa_enabled",
          "remark",
          "created_at",
          "updated_at",
        )
        .get();

      if (!row) return null;

      const detail: UserDetail = {
        id: row.id,
        username: row.username,
        email: row.email ?? null,
        phone: row.phone ?? null,
        nickname: row.nickname ?? null,
        avatar: row.avatar ?? null,
        gender: row.gender ?? null,
        status: row.status,
        deptId: row.dept_id ?? null,
        mfaEnabled: row.mfa_enabled,
        remark: row.remark ?? null,
        createdAt:
          row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        updatedAt:
          row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
      };

      // 写入缓存
      await cache.set(`user:detail:${id}`, detail, { ttl: 300 });

      return detail;
    },

    async list(params) {
      const { page = 1, pageSize = 10, username, status, deptId } = params;

      let query = db.query(UserModel);

      if (username) {
        query = query.where("username", "LIKE", `%${username}%`);
      }
      if (status !== undefined) {
        query = query.where("status", "=", status);
      }
      if (deptId) {
        const deptIds = await collectDescendantDeptIds(db, deptId);
        query = query.where("dept_id", "IN", deptIds);
      }

      const total = await query.count();

      const rows = await query
        .select("id", "username", "nickname", "email", "phone", "status", "dept_id", "created_at")
        .orderBy("created_at", "desc")
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .list();

      const list = rows.map((row) => ({
        id: row.id,
        username: row.username,
        nickname: row.nickname ?? null,
        email: row.email ?? null,
        phone: row.phone ?? null,
        status: row.status,
        deptId: row.dept_id ?? null,
        createdAt:
          row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      }));

      return {
        items: list,
        total,
        page,
        pageSize,
        totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
      };
    },

    async resetPassword(id, newPassword) {
      // 密码策略校验
      const minLength = Number(await configService.getValue("sys_password_min_length")) || 6;
      const complexity =
        ((await configService.getValue("sys_password_complexity")) as "low" | "medium" | "high") ||
        "low";
      const validation = validatePassword(newPassword, { minLength, complexity });
      if (!validation.valid) {
        throw new Error(validation.message);
      }

      const passwordHash = await passwordHasher.hash(newPassword);

      await db.query(UserModel).where("id", "=", id).update({
        password_hash: passwordHash,
        password_changed_at: new Date(),
      });

      // 清除用户缓存
      await cache.del(`user:detail:${id}`);
    },

    async updateStatus(id, status) {
      await db.query(UserModel).where("id", "=", id).update({ status });

      // 清除缓存
      await cache.del(`user:detail:${id}`);
      await cache.del("user:list");
    },

    async export(params) {
      const { username, status, deptId } = params ?? {};

      let query = db.query(UserModel);

      if (username) {
        query = query.where("username", "LIKE", `%${username}%`);
      }
      if (status !== undefined) {
        query = query.where("status", "=", status);
      }
      if (deptId) {
        query = query.where("dept_id", "=", deptId);
      }

      const rows = await query
        .select(
          "id",
          "username",
          "nickname",
          "email",
          "phone",
          "status",
          "dept_id",
          "created_at",
          "updated_at",
        )
        .orderBy("created_at", "desc")
        .list();

      // 生成 CSV
      const header = "ID,用户名,昵称,邮箱,手机,状态,部门ID,创建时间,更新时间";
      const csvRows = rows.map((row) => {
        const escapeCsv = (val: unknown) => {
          if (val === null || val === undefined) return "";
          const str = String(val);
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };
        return [
          escapeCsv(row.id),
          escapeCsv(row.username),
          escapeCsv(row.nickname),
          escapeCsv(row.email),
          escapeCsv(row.phone),
          escapeCsv(row.status),
          escapeCsv(row.dept_id),
          escapeCsv(row.created_at),
          escapeCsv(row.updated_at),
        ].join(",");
      });

      return [header, ...csvRows].join("\n");
    },
  };
}
```
## 5. Permission Loader
```typescript
/**
 * @ventostack/system - PermissionLoader
 * 权限加载器：从数据库加载角色与菜单权限到 RBAC 引擎和行过滤器
 * 支持全量加载、按角色重新加载
 */

import type { RBAC } from "@ventostack/auth";
import type { RowFilter } from "@ventostack/auth";
import type { Database } from "@ventostack/database";
import { MenuModel, RoleMenuModel, RoleModel } from "../models";

/** 权限字符串解析结果 */
interface ParsedPermission {
  resource: string;
  action: string;
}

/** 权限加载器接口 */
export interface PermissionLoader {
  /** 加载所有角色及其权限到 RBAC 引擎 */
  loadAll(): Promise<void>;
  /** 重新加载指定角色的权限 */
  reloadRole(roleCode: string): Promise<void>;
  /** 重新加载所有角色 */
  reloadAll(): Promise<void>;
}

/**
 * 解析权限字符串为资源+动作
 * 权限字符串格式："module:entity:action"
 * @param permission 权限字符串
 * @returns 解析结果
 */
function parsePermission(permission: string): ParsedPermission | null {
  if (!permission) return null;

  const parts = permission.split(":");
  if (parts.length < 2) return null;

  // "module:entity:action" -> resource = "module:entity", action = "action"
  // "entity:action" -> resource = "entity", action = "action"
  const action = parts[parts.length - 1]!;
  const resource = parts.slice(0, -1).join(":");

  return { resource, action };
}

/**
 * 创建权限加载器实例
 * @param deps 依赖项
 * @returns 权限加载器实例
 */
export function createPermissionLoader(deps: {
  db: Database;
  rbac: RBAC;
  rowFilter: RowFilter;
}): PermissionLoader {
  const { db, rbac, rowFilter } = deps;

  /**
   * 加载指定角色的权限
   * @param roleId 角色 ID
   * @param roleCode 角色编码
   */
  async function loadRolePermissions(roleId: string, roleCode: string): Promise<void> {
    // 查询角色关联的菜单 ID
    const roleMenus = await db
      .query(RoleMenuModel)
      .where("role_id", "=", roleId)
      .select("menu_id")
      .list();

    if (roleMenus.length === 0) {
      rbac.addRole({ name: roleCode, permissions: [] });
      return;
    }

    const menuIds = roleMenus.map((rm) => rm.menu_id);

    // 查询菜单权限
    const menus = await db
      .query(MenuModel)
      .where("id", "IN", menuIds)
      .where("status", "=", 1)
      .where("permission", "IS NOT NULL")
      .select("permission")
      .list();

    const permissions = menus
      .map((row) => (row.permission ? parsePermission(row.permission) : null))
      .filter((p): p is ParsedPermission => p !== null);

    // 注册角色到 RBAC
    rbac.addRole({
      name: roleCode,
      permissions: permissions.map((p) => ({
        resource: p.resource,
        action: p.action,
      })),
    });
  }

  /**
   * 加载数据范围规则到行过滤器
   */
  async function loadDataScopeRules(): Promise<void> {
    // 查询有自定义数据范围的角色
    const roles = await db
      .query(RoleModel)
      .where("status", "=", 1)
      .where("data_scope", "IS NOT NULL")
      .select("code", "data_scope")
      .list();

    for (const role of roles) {
      // data_scope 含义：
      // 1 = 全部数据
      // 2 = 本部门及子部门
      // 3 = 本部门
      // 4 = 仅本人
      // 5 = 自定义部门
      switch (role.data_scope) {
        case 4:
          // 仅本人：按创建者过滤
          rowFilter.addRule({
            resource: "*",
            field: "created_by",
            operator: "eq",
            valueFrom: "user",
            value: "userId",
          });
          break;
        // 其他数据范围规则按需扩展
      }
    }
  }

  return {
    async loadAll() {
      // 1. 查询所有启用角色
      const roles = await db.query(RoleModel).where("status", "=", 1).select("id", "code").list();

      // 2. 为每个角色加载权限
      for (const role of roles) {
        await loadRolePermissions(role.id, role.code);
      }

      // 3. 加载数据范围规则
      await loadDataScopeRules();
    },

    async reloadRole(roleCode) {
      // 查询角色
      const role = await db
        .query(RoleModel)
        .where("code", "=", roleCode)
        .where("status", "=", 1)
        .select("id")
        .get();

      if (!role) {
        // 角色不存在或已禁用，从 RBAC 中移除
        rbac.removeRole(roleCode);
        return;
      }

      await loadRolePermissions(role.id, roleCode);
    },

    async reloadAll() {
      // 清除所有现有角色
      const existingRoles = rbac.listRoles();
      for (const role of existingRoles) {
        rbac.removeRole(role.name);
      }

      // 重新加载
      await this.loadAll();
    },
  };
}
```
## 6. Common Routes (Response Wrapper)
```typescript
/**
 * @ventostack/system - 路由通用工具
 */

/** 统一 JSON 响应头 */
export const JSON_HEADERS = { "Content-Type": "application/json" } as const;

/** 成功响应 */
export function ok(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, message: "成功", data }), {
    status: 200,
    headers: JSON_HEADERS,
  });
}

/** 分页成功响应 */
export function okPage(list: unknown[], total: number, page: number, pageSize: number): Response {
  return new Response(
    JSON.stringify({
      code: 0,
      message: "成功",
      data: { list, total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1 },
    }),
    { status: 200, headers: JSON_HEADERS },
  );
}

/** 错误响应 */
export function fail(
  message: string,
  code = 400,
  status = 400,
  extra?: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify({ code, message, data: extra ?? null }), {
    status,
    headers: JSON_HEADERS,
  });
}

/** 从请求体解析 JSON */
export async function parseBody<T = Record<string, unknown>>(request: Request): Promise<T> {
  const text = await request.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

/** 从 query 获取分页参数 */
export function pageOf(query: Record<string, unknown>): { page: number; pageSize: number } {
  return {
    page: Math.max(1, Number(query.page) || 1),
    pageSize: Math.min(100, Math.max(1, Number(query.pageSize) || 10)),
  };
}
```

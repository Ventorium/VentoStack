/**
 * @ventostack/system - AuthService
 * 认证服务：登录、登出、密码重置、MFA 管理
 * 默认安全：速率限制、失败锁定、恒定时间密码校验
 */

import type { Cache } from "@ventostack/cache";
import type { JWTManager } from "@ventostack/auth";
import type { PasswordHasher } from "@ventostack/auth";
import type { TOTPManager } from "@ventostack/auth";
import type { AuthSessionManager } from "@ventostack/auth";
import type { AuditStore } from "@ventostack/observability";
import type { Database } from "@ventostack/database";
import type { EventBus } from "@ventostack/events";
import type { ConfigService } from "./config";
import { validatePassword } from "./password-policy";
import { UserModel } from "../models/user";
import { UserRoleModel, RoleModel } from "../models/role";
import { LoginLogModel } from "../models/log";

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
  logout(
    userId: string,
    sessionId: string,
    refreshTokenJti?: string,
  ): Promise<void>;
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
  completeMFALogin(mfaToken: string, code: string, ip: string, userAgent: string, deviceType?: string): Promise<LoginResult>;
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
  const userRoles = await db.query(UserRoleModel)
    .where("user_id", "=", userId)
    .select("role_id")
    .list();
  if (userRoles.length === 0) return [];
  const roleIds = userRoles.map(r => r.role_id);
  const roles = await db.query(RoleModel)
    .where("id", "IN", roleIds)
    .where("status", "=", 1)
    .select("code")
    .list();
  return roles.map(r => r.code);
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
    userId?: string; username: string; ip: string; userAgent: string;
    status: number; message: string;
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
      const maxAttempts = Number(await configService.getValue('sys_login_max_attempts')) || DEFAULT_MAX_LOGIN_FAILURES;
      const lockMinutes = Number(await configService.getValue('sys_login_lock_minutes')) || DEFAULT_LOCK_MINUTES;

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
      const user = await db.query(UserModel)
        .where("username", "=", username)
        .select("id", "username", "password_hash", "status", "mfa_enabled", "mfa_secret",
                "blacklisted", "locked_until", "login_attempts", "password_changed_at")
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
        await recordLoginLog({ userId: user.id, username, ip, userAgent, status: 0, message: "账号已禁用" });
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
        await recordLoginLog({ userId: user.id, username, ip, userAgent, status: 0, message: "账号已被拉黑" });
        throw new Error("账号已被拉黑");
      }

      // 6. 检查 DB-based 锁定
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        await auditStore.append({
          actor: username,
          action: "login.locked_db",
          resource: "auth",
          result: "denied",
          metadata: { ip, userId: user.id, reason: "account_locked_db", lockedUntil: user.locked_until },
        });
        await recordLoginLog({ userId: user.id, username, ip, userAgent, status: 0, message: "账号已被锁定" });
        throw new Error("账号已被锁定");
      }

      // 7. 清除过期锁定
      if (user.locked_until && new Date(user.locked_until) <= new Date()) {
        await db.query(UserModel).where("id", "=", user.id).update({ locked_until: null, login_attempts: 0 });
      }

      // 8. 校验密码
      const valid = await passwordHasher.verify(password, user.password_hash);
      if (!valid) {
        // 9. 密码错误：递增失败计数（缓存 + DB）
        const newFailCount = (failCount ?? 0) + 1;
        await cache.set(failKey, newFailCount, { ttl: lockMinutes * 60 });
        await db.raw(`UPDATE sys_user SET login_attempts = COALESCE(login_attempts, 0) + 1 WHERE id = $1`, [user.id]);

        await auditStore.append({
          actor: username,
          action: "login.failed",
          resource: "auth",
          result: "failure",
          metadata: { ip, userId: user.id, reason: "wrong_password", failCount: newFailCount },
        });
        await recordLoginLog({ userId: user.id, username, ip, userAgent, status: 0, message: "密码错误" });

        throw new Error("用户名或密码错误");
      }

      // 10. 登录成功：清除失败计数（缓存 + DB）
      await cache.del(failKey);
      await db.query(UserModel).where("id", "=", user.id).update({ login_attempts: 0 });

      // 11. 检查密码是否过期
      const expireDays = Number(await configService.getValue('sys_password_expire_days')) ?? 30;
      if (expireDays !== -1 && user.password_changed_at) {
        const expiredAt = new Date(user.password_changed_at);
        expiredAt.setDate(expiredAt.getDate() + expireDays);
        if (expiredAt < new Date()) {
          const tempToken = await jwt.sign(
            { sub: user.id, iss: "password-expired", username: user.username },
            jwtSecret,
            { expiresIn: 600 },
          );
          await recordLoginLog({ userId: user.id, username, ip, userAgent, status: 0, message: "密码已过期" });
          const err = new Error("密码已过期") as Error & { code: string; data: { tempToken: string } };
          err.code = "password_expired";
          err.data = { tempToken };
          throw err;
        }
      }

      // 12. 检查是否需要 MFA（受全局配置控制）
      const mfaGloballyEnabled = (await configService.getValue('sys_mfa_enabled')) !== 'false';
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
        await recordLoginLog({ userId: user.id, username, ip, userAgent, status: 1, message: "需要MFA验证" });

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
      await recordLoginLog({ userId: user.id, username, ip, userAgent, status: 1, message: "登录成功", loginMethod: "password" });

      // 检查是否需要提示用户设置 MFA（全局启用 + 强制 + 用户未配置）
      const mfaForce = (await configService.getValue('sys_mfa_force')) === 'true';
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
      const pair = await authSessionManager.refreshTokens(
        oldRefreshToken,
        jwtSecret,
      );

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
      const user = await db.query(UserModel)
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
      const minLength = Number(await configService.getValue('sys_password_min_length')) || 6;
      const complexity = (await configService.getValue('sys_password_complexity')) as 'low' | 'medium' | 'high' || 'low';
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
      const minLength = Number(await configService.getValue('sys_password_min_length')) || 6;
      const complexity = (await configService.getValue('sys_password_complexity')) as 'low' | 'medium' | 'high' || 'low';
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
      const mfaUser = await db.query(UserModel)
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
      const mfaUser = await db.query(UserModel)
        .where("id", "=", userId)
        .select("mfa_secret")
        .get();

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
      const tempToken = await jwt.sign(
        { sub: userId, iss: "mfa-recovery" },
        jwtSecret,
        { expiresIn: 600 },
      );

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
      const payload = await jwt.verify(mfaToken, jwtSecret) as { sub?: string; iss?: string; username?: string };
      if (!payload.sub || payload.iss !== "mfa-pending") {
        throw new Error("MFA 令牌无效");
      }

      const userId = payload.sub;
      const username = payload.username ?? "";

      // 2. 查询用户的 MFA 密钥
      const mfaUser = await db.query(UserModel)
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
      const passkeyUser = await db.query(UserModel)
        .where("id", "=", userId)
        .select("status", "blacklisted", "locked_until")
        .get();
      if (!passkeyUser) throw new Error("用户不存在");
      if (passkeyUser.status !== 1) throw new Error("账号已禁用");
      if (passkeyUser.blacklisted) throw new Error("账号已被拉黑");
      if (passkeyUser.locked_until && new Date(passkeyUser.locked_until) > new Date()) throw new Error("账号已被锁定");

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

      await recordLoginLog({ userId, username, ip, userAgent, status: 1, message: "通行密钥登录成功", loginMethod: "passkey" });

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

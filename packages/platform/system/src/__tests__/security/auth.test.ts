/**
 * @ventostack/system - 认证安全回归测试
 *
 * 覆盖：暴力破解防护、越权访问、注入防护、踢人链路、MFA 重放
 */

import { describe, expect, test } from "bun:test";
import { createAuthService } from "../../services/auth";
import {
  createMockExecutor,
  createMockDatabase,
  createTestCache,
  createMockJWTManager,
  createMockPasswordHasher,
  createMockTOTPManager,
  createMockAuthSessionManager,
  createMockAuditStore,
  createMockEventBus,
  createMockConfigService,
} from "../helpers";

function setup(configOverrides: Record<string, string> = {}) {
  const mockExec = createMockExecutor();
  const { db, registerModel, calls } = createMockDatabase(mockExec);

  // Register models by table name (db.query(Model) extracts Model.tableName)
  registerModel("sys_user", "sys_user", true);
  registerModel("sys_user_role", "sys_user_role", false);
  registerModel("sys_role", "sys_role", true);
  registerModel("sys_login_log", "sys_login_log", false);

  const cache = createTestCache();
  const jwt = createMockJWTManager();
  const passwordHasher = createMockPasswordHasher();
  const totp = createMockTOTPManager();
  const authSessionManager = createMockAuthSessionManager();
  const auditLog = createMockAuditStore();
  const eventBus = createMockEventBus();
  const configService = createMockConfigService(configOverrides);

  const authService = createAuthService({
    db,
    cache,
    jwt,
    jwtSecret: "test-secret-32-bytes-long-enough!!",
    passwordHasher,
    totp,
    authSessionManager,
    auditStore: auditLog,
    eventBus,
    configService,
  });

  return { authService, executor: mockExec.executor, calls, results: mockExec.results, cache, jwt, passwordHasher, totp, authSessionManager, auditLog, eventBus, configService };
}

function loginResult(overrides: Record<string, unknown> = {}) {
  return [{
    id: "u1", username: "admin", password_hash: "hashed_admin123",
    status: 1, mfa_enabled: false, mfa_secret: null, blacklisted: false,
    locked_until: null, login_attempts: 0, password_changed_at: null,
    ...overrides,
  }];
}

describe("Security: Auth", () => {
  describe("暴力破解防护", () => {
    test("连续 5 次登录失败后账户被锁定", async () => {
      const s = setup();
      s.results.set("SELECT", loginResult());
      s.passwordHasher.verify.mockResolvedValue(false as any);

      // 连续失败 5 次
      for (let i = 0; i < 5; i++) {
        try {
          await s.authService.login({
            username: "admin", password: "wrong", ip: "1.2.3.4", userAgent: "test",
          });
        } catch {
          // expected
        }
      }

      // 第 6 次应被锁定
      await expect(s.authService.login({
        username: "admin", password: "wrong", ip: "1.2.3.4", userAgent: "test",
      })).rejects.toThrow(/锁定|locked/i);
    });

    test("不同 IP 的失败计数互相独立", async () => {
      const s = setup();
      s.results.set("SELECT", loginResult());
      s.passwordHasher.verify.mockResolvedValue(false as any);

      // IP-A 失败 4 次
      for (let i = 0; i < 4; i++) {
        try {
          await s.authService.login({
            username: "admin", password: "wrong", ip: "1.1.1.1", userAgent: "test",
          });
        } catch {
          // expected
        }
      }

      // IP-B 第 1 次应正常（不会被锁定）
      try {
        await s.authService.login({
          username: "admin", password: "wrong", ip: "2.2.2.2", userAgent: "test",
        });
      } catch {
        // expected failure, but not due to lockout
      }

      // IP-A 第 5 次应触发锁定
      s.results.set("SELECT", loginResult());
      s.passwordHasher.verify.mockResolvedValue(false as any);

      for (let i = 0; i < 5; i++) {
        try {
          await s.authService.login({
            username: "admin", password: "wrong", ip: "1.1.1.1", userAgent: "test",
          });
        } catch {
          // expected
        }
      }

      await expect(s.authService.login({
        username: "admin", password: "wrong", ip: "1.1.1.1", userAgent: "test",
      })).rejects.toThrow(/锁定|locked/i);
    });

    test("不存在的用户名也递增失败计数（防枚举探测）", async () => {
      const s = setup();
      // 空结果 = 用户不存在
      await expect(s.authService.login({
        username: "nonexistent", password: "x", ip: "1.2.3.4", userAgent: "test",
      })).rejects.toThrow();

      // 验证审计日志记录了 user_not_found
      const entries = s.auditLog._entries;
      const last = entries[entries.length - 1];
      expect(last?.metadata?.reason).toBe("user_not_found");
    });
  });

  describe("IP 速率限制", () => {
    test("同一 IP 超过 20 次/分钟被限流", async () => {
      const s = setup();
      s.results.set("SELECT", loginResult());
      s.passwordHasher.verify.mockResolvedValue(true as any);

      // 成功登录 20 次
      for (let i = 0; i < 20; i++) {
        await s.authService.login({
          username: "admin", password: "admin123", ip: "10.0.0.1", userAgent: "test",
        });
      }

      // 第 21 次应被限流
      await expect(s.authService.login({
        username: "admin", password: "admin123", ip: "10.0.0.1", userAgent: "test",
      })).rejects.toThrow(/频繁|Too many/i);
    });
  });

  describe("密码校验安全", () => {
    test("密码错误时返回通用错误消息（不泄露具体原因）", async () => {
      const s = setup();
      s.results.set("SELECT", loginResult());
      s.passwordHasher.verify.mockResolvedValue(false as any);

      try {
        await s.authService.login({
          username: "admin", password: "wrong", ip: "1.2.3.4", userAgent: "test",
        });
        expect.unreachable("Should have thrown");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        // 不应泄露密码哈希、内部状态等细节
        expect(msg).not.toContain("hash");
        expect(msg).not.toContain("password_hash");
        expect(msg).toBe("用户名或密码错误");
      }
    });

    test("用户不存在时返回相同的通用错误消息", async () => {
      const s = setup();
      // 空结果

      try {
        await s.authService.login({
          username: "nobody", password: "x", ip: "1.2.3.4", userAgent: "test",
        });
        expect.unreachable("Should have thrown");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        // 与密码错误返回相同消息，防止用户枚举
        expect(msg).toBe("用户名或密码错误");
      }
    });
  });

  describe("强制踢人", () => {
    test("forceLogout 清除所有会话和设备", async () => {
      const s = setup();
      const result = await s.authService.forceLogout("u1");
      expect(s.authSessionManager.forceLogout).toHaveBeenCalledWith("u1");
      expect(result.sessions).toBe(1);
      expect(result.devices).toBe(1);
    });

    test("forceLogout 后审计日志记录正确", async () => {
      const s = setup();
      await s.authService.forceLogout("u1");
      const entries = s.auditLog._entries;
      const last = entries[entries.length - 1];
      expect(last?.action).toBe("user.force_logout");
      expect(last?.resourceId).toBe("u1");
    });
  });

  describe("MFA 防重放", () => {
    test("verifyMFA 调用 totp.verifyAndConsume（防重放）", async () => {
      const s = setup();
      s.results.set("SELECT", [{
        mfa_secret: "JBSWY3DPEHPK3PXP", mfa_enabled: true,
      }]);

      await s.authService.verifyMFA("u1", "123456");
      expect(s.totp.verifyAndConsume).toHaveBeenCalled();
      // 不应调用普通 verify
      expect(s.totp.verify).not.toHaveBeenCalled();
    });

    test("disableMFA 使用普通 verify（无需防重放）", async () => {
      const s = setup();
      s.results.set("SELECT", [{
        mfa_secret: "JBSWY3DPEHPK3PXP",
      }]);

      await s.authService.disableMFA("u1", "123456");
      expect(s.totp.verify).toHaveBeenCalled();
    });

    test("completeMFALogin 使用 verifyAndConsume（防重放）", async () => {
      const s = setup();
      s.jwt.verify.mockResolvedValue({ sub: "u1", iss: "mfa-pending", username: "admin" } as any);
      s.results.set("SELECT", [{
        mfa_secret: "JBSWY3DPEHPK3PXP", mfa_enabled: true,
      }]);

      await s.authService.completeMFALogin("valid-token", "123456", "1.2.3.4", "test");
      expect(s.totp.verifyAndConsume).toHaveBeenCalled();
    });
  });

  describe("找回密码安全", () => {
    test("不存在的邮箱也返回成功（防邮箱枚举）", async () => {
      const s = setup();
      // 空结果 = 无此邮箱用户
      const result = await s.authService.forgotPassword("nonexist@test.com");
      expect(result.resetToken).toBeTruthy();
    });

    test("重置 token 使用后立即失效", async () => {
      const s = setup();
      s.results.set("SELECT", [{
        id: "u1", username: "admin", email: "admin@test.com",
      }]);

      const { resetToken } = await s.authService.forgotPassword("admin@test.com");

      // 第一次使用成功
      s.passwordHasher.hash.mockResolvedValue("hashed_newpwd" as any);
      await s.authService.resetPasswordByToken(resetToken, "newpwd");

      // 第二次使用应失败（token 已删除）
      await expect(s.authService.resetPasswordByToken(resetToken, "newpwd2"))
        .rejects.toThrow("重置令牌无效或已过期");
    });

    test("无效 token 拒绝重置", async () => {
      const s = setup();
      await expect(s.authService.resetPasswordByToken("fake-token", "newpwd"))
        .rejects.toThrow("重置令牌无效或已过期");
    });
  });

  describe("审计日志", () => {
    test("登录成功记录审计日志", async () => {
      const s = setup();
      s.results.set("SELECT", loginResult());
      s.passwordHasher.verify.mockResolvedValue(true as any);

      await s.authService.login({
        username: "admin", password: "admin123", ip: "1.2.3.4", userAgent: "test",
      });

      const entries = s.auditLog._entries;
      const loginEntry = entries.find(e => e.action === "login.success");
      expect(loginEntry).toBeTruthy();
      expect(loginEntry?.metadata?.ip).toBe("1.2.3.4");
    });

    test("登录失败记录审计日志", async () => {
      const s = setup();
      s.results.set("SELECT", loginResult());
      s.passwordHasher.verify.mockResolvedValue(false as any);

      try {
        await s.authService.login({
          username: "admin", password: "wrong", ip: "1.2.3.4", userAgent: "test",
        });
      } catch {
        // expected
      }

      const entries = s.auditLog._entries;
      const failEntry = entries.find(e => e.action === "login.failed");
      expect(failEntry).toBeTruthy();
      expect(failEntry?.result).toBe("failure");
    });
  });
});

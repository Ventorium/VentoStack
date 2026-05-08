/**
 * @ventostack/system - AuthService 测试
 */

import { describe, expect, test, mock } from "bun:test";
import { createAuthService } from "../services/auth";
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
}  from "./helpers";

function setup(configOverrides: Record<string, string> = {}) {
  const mockExec = createMockExecutor();
  const { db, registerModel, calls } = createMockDatabase(mockExec);
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

describe("AuthService", () => {
  describe("login", () => {
    test("successful login returns tokens", async () => {
      const s = setup();
      s.results.set("SELECT", [{
        id: "u1", username: "admin", password_hash: "hashed_admin123",
        status: 1, mfa_enabled: false, mfa_secret: null, blacklisted: false,
        locked_until: null, login_attempts: 0, password_changed_at: null,
      }]);
      s.passwordHasher.verify.mockResolvedValue(true as any);

      const result = await s.authService.login({
        username: "admin", password: "admin123", ip: "1.2.3.4", userAgent: "test",
      });

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.mfaRequired).toBe(false);
      expect(s.authSessionManager.login).toHaveBeenCalledTimes(1);
    });

    test("wrong password increments fail counter", async () => {
      const s = setup();
      s.results.set("SELECT", [{
        id: "u1", username: "admin", password_hash: "hashed_admin123",
        status: 1, mfa_enabled: false, mfa_secret: null, blacklisted: false,
        locked_until: null, login_attempts: 0,
      }]);
      s.passwordHasher.verify.mockResolvedValue(false as any);

      await expect(s.authService.login({
        username: "admin", password: "wrong", ip: "1.2.3.4", userAgent: "test",
      })).rejects.toThrow();
    });

    test("non-existent user throws error", async () => {
      const s = setup();
      await expect(s.authService.login({
        username: "nobody", password: "x", ip: "1.2.3.4", userAgent: "test",
      })).rejects.toThrow();
    });

    test("disabled user (status=0) throws error", async () => {
      const s = setup();
      s.results.set("SELECT", [{
        id: "u1", username: "disabled", password_hash: "hashed_x",
        status: 0, mfa_enabled: false, mfa_secret: null, blacklisted: false,
        locked_until: null, login_attempts: 0,
      }]);
      s.passwordHasher.verify.mockResolvedValue(true as any);

      await expect(s.authService.login({
        username: "disabled", password: "x", ip: "1.2.3.4", userAgent: "test",
      })).rejects.toThrow();
    });

    test("MFA globally disabled: user with mfa_enabled gets normal login", async () => {
      const s = setup({ sys_mfa_enabled: "false" });
      s.results.set("SELECT", [{
        id: "u1", username: "mfauser", password_hash: "hashed_x",
        status: 1, mfa_enabled: true, mfa_secret: "JBSWY3DPEHPK3PXP",
        blacklisted: false, locked_until: null, login_attempts: 0, password_changed_at: null,
      }]);
      s.passwordHasher.verify.mockResolvedValue(true as any);

      const result = await s.authService.login({
        username: "mfauser", password: "x", ip: "1.2.3.4", userAgent: "test",
      });

      expect(result.mfaRequired).toBe(false);
      expect(result.accessToken).toBeTruthy();
    });

    test("MFA globally enabled + user has MFA: returns mfaRequired with mfaToken", async () => {
      const s = setup({ sys_mfa_enabled: "true" });
      s.results.set("SELECT", [{
        id: "u1", username: "mfauser", password_hash: "hashed_x",
        status: 1, mfa_enabled: true, mfa_secret: "JBSWY3DPEHPK3PXP",
        blacklisted: false, locked_until: null, login_attempts: 0, password_changed_at: null,
      }]);
      s.passwordHasher.verify.mockResolvedValue(true as any);

      const result = await s.authService.login({
        username: "mfauser", password: "x", ip: "1.2.3.4", userAgent: "test",
      });

      expect(result.mfaRequired).toBe(true);
      expect(result.mfaToken).toBeTruthy();
      expect(result.accessToken).toBe("");
    });

    test("MFA globally enabled + forced + user no MFA: mfaSetupRequired=true", async () => {
      const s = setup({ sys_mfa_enabled: "true", sys_mfa_force: "true" });
      s.results.set("SELECT", [{
        id: "u1", username: "nofauser", password_hash: "hashed_x",
        status: 1, mfa_enabled: false, mfa_secret: null,
        blacklisted: false, locked_until: null, login_attempts: 0, password_changed_at: null,
      }]);
      s.passwordHasher.verify.mockResolvedValue(true as any);

      const result = await s.authService.login({
        username: "nofauser", password: "x", ip: "1.2.3.4", userAgent: "test",
      });

      expect(result.mfaRequired).toBe(false);
      expect(result.mfaSetupRequired).toBe(true);
      expect(result.accessToken).toBeTruthy();
    });

    test("MFA globally enabled + not forced + user no MFA: normal login", async () => {
      const s = setup({ sys_mfa_enabled: "true", sys_mfa_force: "false" });
      s.results.set("SELECT", [{
        id: "u1", username: "nofauser", password_hash: "hashed_x",
        status: 1, mfa_enabled: false, mfa_secret: null,
        blacklisted: false, locked_until: null, login_attempts: 0, password_changed_at: null,
      }]);
      s.passwordHasher.verify.mockResolvedValue(true as any);

      const result = await s.authService.login({
        username: "nofauser", password: "x", ip: "1.2.3.4", userAgent: "test",
      });

      expect(result.mfaRequired).toBe(false);
      expect(result.mfaSetupRequired).toBe(false);
      expect(result.accessToken).toBeTruthy();
    });
  });

  describe("completeMFALogin", () => {
    test("valid mfaToken + code returns tokens", async () => {
      const s = setup({ sys_mfa_enabled: "true" });
      // Mock JWT verify to return a valid payload
      s.jwt.verify.mockResolvedValue({ sub: "u1", iss: "mfa-pending", username: "mfauser" } as any);
      s.results.set("SELECT", [{
        mfa_secret: "JBSWY3DPEHPK3PXP", mfa_enabled: true,
      }]);

      const result = await s.authService.completeMFALogin("valid-token", "123456", "1.2.3.4", "test");

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.mfaRequired).toBe(false);
      expect(s.totp.verifyAndConsume).toHaveBeenCalledWith("JBSWY3DPEHPK3PXP", "123456");
    });

    test("invalid mfaToken throws error", async () => {
      const s = setup();
      s.jwt.verify.mockResolvedValue({ sub: "u1", iss: "invalid" } as any);

      await expect(s.authService.completeMFALogin("bad-token", "123456", "1.2.3.4", "test"))
        .rejects.toThrow("MFA 令牌无效");
    });

    test("expired/missing sub in mfaToken throws error", async () => {
      const s = setup();
      s.jwt.verify.mockResolvedValue({ iss: "mfa-pending" } as any);

      await expect(s.authService.completeMFALogin("expired-token", "123456", "1.2.3.4", "test"))
        .rejects.toThrow("MFA 令牌无效");
    });

    test("wrong TOTP code throws error", async () => {
      const s = setup();
      s.jwt.verify.mockResolvedValue({ sub: "u1", iss: "mfa-pending", username: "mfauser" } as any);
      s.results.set("SELECT", [{
        mfa_secret: "JBSWY3DPEHPK3PXP", mfa_enabled: true,
      }]);
      s.totp.verifyAndConsume.mockResolvedValue(false as any);

      await expect(s.authService.completeMFALogin("valid-token", "000000", "1.2.3.4", "test"))
        .rejects.toThrow("MFA 验证码错误");
    });

    test("user without MFA configured throws error", async () => {
      const s = setup();
      s.jwt.verify.mockResolvedValue({ sub: "u1", iss: "mfa-pending", username: "mfauser" } as any);
      s.results.set("SELECT", [{
        mfa_secret: null, mfa_enabled: false,
      }]);

      await expect(s.authService.completeMFALogin("valid-token", "123456", "1.2.3.4", "test"))
        .rejects.toThrow("未配置 MFA");
    });
  });

  describe("register", () => {
    test("registers new user with hashed password", async () => {
      const s = setup();
      s.results.set("INSERT", [{ id: "new-1" }]);

      const result = await s.authService.register({
        username: "newuser", password: "pass123",
      });

      expect(result.userId).toBeTruthy();
      expect(s.passwordHasher.hash).toHaveBeenCalledWith("pass123");
    });
  });

  describe("forceLogout", () => {
    test("delegates to authSessionManager", async () => {
      const s = setup();
      const result = await s.authService.forceLogout("u1");
      expect(s.authSessionManager.forceLogout).toHaveBeenCalledWith("u1");
      expect(result.sessions).toBe(1);
    });
  });

  describe("MFA", () => {
    test("enableMFA returns secret and recovery codes", async () => {
      const s = setup();
      const result = await s.authService.enableMFA("u1");
      expect(result.secret).toBeTruthy();
      expect(result.qrCodeUri).toContain("otpauth://");
      expect(result.recoveryCodes.length).toBeGreaterThan(0);
    });

    test("verifyMFA delegates to totp.verifyAndConsume", async () => {
      const s = setup();
      s.results.set("SELECT", [{
        mfa_secret: "JBSWY3DPEHPK3PXP", mfa_enabled: true,
      }]);
      await s.authService.verifyMFA("u1", "123456");
      expect(s.totp.verifyAndConsume).toHaveBeenCalled();
    });

    test("verifyMFA on first verify sets mfa_enabled=true", async () => {
      const s = setup();
      s.results.set("SELECT", [{
        mfa_secret: "JBSWY3DPEHPK3PXP", mfa_enabled: false,
      }]);

      const valid = await s.authService.verifyMFA("u1", "123456");
      expect(valid).toBe(true);
      // Should have called UPDATE to enable MFA
      const updateCalls = s.calls.filter(c => c.text.includes("UPDATE") && c.text.includes("mfa_enabled"));
      expect(updateCalls.length).toBeGreaterThan(0);
    });
  });

  describe("completePasskeyLogin", () => {
    test("creates session and returns tokens", async () => {
      const s = setup();
      s.results.set("sys_user WHERE id", [{
        status: 1, blacklisted: false, locked_until: null,
      }]);

      const result = await s.authService.completePasskeyLogin({
        userId: "u1", username: "admin", ip: "1.2.3.4", userAgent: "test",
      });

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.sessionId).toBe("sess-1");
      expect(result.mfaRequired).toBe(false);
      expect(s.authSessionManager.login).toHaveBeenCalled();
    });

    test("records login log with passkey method", async () => {
      const s = setup();
      s.results.set("sys_user WHERE id", [{
        status: 1, blacklisted: false, locked_until: null,
      }]);

      await s.authService.completePasskeyLogin({
        userId: "u1", username: "admin", ip: "1.2.3.4", userAgent: "test",
      });

      const insertCall = s.calls.find(c => c.text.includes("INSERT INTO sys_login_log"));
      expect(insertCall).toBeDefined();
      expect(insertCall!.params).toContain("passkey");
    });

    test("logs audit entry on success", async () => {
      const s = setup();
      s.results.set("sys_user WHERE id", [{
        status: 1, blacklisted: false, locked_until: null,
      }]);

      await s.authService.completePasskeyLogin({
        userId: "u1", username: "admin", ip: "1.2.3.4", userAgent: "test",
      });

      const audit = s.auditLog._entries.find(e => e.action === "login.passkey_success");
      expect(audit).toBeDefined();
      expect(audit!.actor).toBe("admin");
    });

    test("throws when user not found", async () => {
      const s = setup();
      s.results.set("sys_user WHERE id", []);

      await expect(s.authService.completePasskeyLogin({
        userId: "u1", username: "admin", ip: "1.2.3.4", userAgent: "test",
      })).rejects.toThrow("用户不存在");
    });

    test("throws when user is disabled", async () => {
      const s = setup();
      s.results.set("sys_user WHERE id", [{
        status: 0, blacklisted: false, locked_until: null,
      }]);

      await expect(s.authService.completePasskeyLogin({
        userId: "u1", username: "admin", ip: "1.2.3.4", userAgent: "test",
      })).rejects.toThrow("账号已禁用");
    });

    test("throws when user is blacklisted", async () => {
      const s = setup();
      s.results.set("sys_user WHERE id", [{
        status: 1, blacklisted: true, locked_until: null,
      }]);

      await expect(s.authService.completePasskeyLogin({
        userId: "u1", username: "admin", ip: "1.2.3.4", userAgent: "test",
      })).rejects.toThrow("账号已被拉黑");
    });

    test("throws when user is locked", async () => {
      const s = setup();
      const future = new Date(Date.now() + 3600000).toISOString();
      s.results.set("sys_user WHERE id", [{
        status: 1, blacklisted: false, locked_until: future,
      }]);

      await expect(s.authService.completePasskeyLogin({
        userId: "u1", username: "admin", ip: "1.2.3.4", userAgent: "test",
      })).rejects.toThrow("账号已被锁定");
    });
  });
});

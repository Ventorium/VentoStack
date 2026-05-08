/**
 * @ventostack/system - PasskeyService 测试
 */

import { describe, expect, test, mock, beforeEach } from "bun:test";
import { createPasskeyService } from "../services/passkey";
import {
  createMockExecutor,
  createMockDatabase,
  createTestCache,
  createMockAuditStore,
} from "./helpers";

// Mock @simplewebauthn/server
const mockGenerateRegistrationOptions = mock(async () => ({
  challenge: "reg-challenge-base64",
  rp: { name: "VentoStack Admin", id: "localhost" },
  user: { id: "user-1", name: "user-1", displayName: "user-1" },
  pubKeyCredParams: [],
  excludeCredentials: [],
  authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  timeout: 60000,
}));

const mockVerifyRegistrationResponse = mock(async () => ({
  verified: true,
  registrationInfo: {
    credential: {
      id: "cred-123",
      publicKey: new Uint8Array([1, 2, 3]),
      counter: 0,
      transports: ["internal"],
    },
    credentialDeviceType: "singleDevice",
    credentialBackedUp: false,
    aaguid: "00000000-0000-0000-0000-000000000000",
  },
}));

const mockGenerateAuthenticationOptions = mock(async () => ({
  challenge: "auth-challenge-base64",
  rpId: "localhost",
  allowCredentials: [],
  timeout: 60000,
}));

const mockVerifyAuthenticationResponse = mock(async () => ({
  verified: true,
  authenticationInfo: {
    newCounter: 1,
    credentialID: "cred-123",
    credentialDeviceType: "singleDevice",
    credentialBackedUp: false,
  },
}));

mock.module("@simplewebauthn/server", () => ({
  generateRegistrationOptions: mockGenerateRegistrationOptions,
  verifyRegistrationResponse: mockVerifyRegistrationResponse,
  generateAuthenticationOptions: mockGenerateAuthenticationOptions,
  verifyAuthenticationResponse: mockVerifyAuthenticationResponse,
}));

function setup() {
  const mockExec = createMockExecutor();
  const { db, registerModel, calls } = createMockDatabase(mockExec);
  registerModel("sys_passkey", "sys_passkey", false);
  registerModel("sys_user", "sys_user", true);
  const cache = createTestCache();
  const auditStore = createMockAuditStore();

  const passkeyService = createPasskeyService({
    db,
    cache,
    rpID: "localhost",
    rpName: "VentoStack Admin",
    rpOrigins: ["http://localhost:5173"],
    auditStore,
  });

  return { passkeyService, executor: mockExec.executor, calls, results: mockExec.results, cache, auditStore };
}

describe("PasskeyService", () => {
  beforeEach(() => {
    mockGenerateRegistrationOptions.mockClear();
    mockVerifyRegistrationResponse.mockClear();
    mockGenerateAuthenticationOptions.mockClear();
    mockVerifyAuthenticationResponse.mockClear();
  });

  describe("beginRegistration", () => {
    test("returns options and challengeId when under limit", async () => {
      const s = setup();
      s.results.set("COUNT", [{ count: 0 }]);
      s.results.set("credential_id", []);

      const result = await s.passkeyService.beginRegistration("user-1");

      expect(result.options).toBeDefined();
      expect(result.challengeId).toBeDefined();
      expect(mockGenerateRegistrationOptions).toHaveBeenCalled();
    });

    test("throws when max passkeys reached (3)", async () => {
      const s = setup();
      s.results.set("COUNT", [{ count: 3 }]);

      expect(s.passkeyService.beginRegistration("user-1")).rejects.toThrow("最多只能注册 3 个通行密钥");
    });

    test("includes existing credentials in excludeCredentials", async () => {
      const s = setup();
      s.results.set("COUNT", [{ count: 1 }]);
      s.results.set("credential_id", [{ credential_id: "existing-cred-1" }]);

      await s.passkeyService.beginRegistration("user-1");

      const callArgs = mockGenerateRegistrationOptions.mock.calls[0]![0] as any;
      expect(callArgs.excludeCredentials).toHaveLength(1);
      expect(callArgs.excludeCredentials[0].id).toBe("existing-cred-1");
    });

    test("stores challenge in cache", async () => {
      const s = setup();
      s.results.set("COUNT", [{ count: 0 }]);
      s.results.set("credential_id", []);

      const result = await s.passkeyService.beginRegistration("user-1");
      const cached = await s.cache.get<string>(`passkey_reg:${result.challengeId}`);
      expect(cached).toBe("reg-challenge-base64");
    });
  });

  describe("finishRegistration", () => {
    test("throws when challenge expired", async () => {
      const s = setup();
      await expect(
        s.passkeyService.finishRegistration("user-1", "My Key", "nonexistent", {} as any)
      ).rejects.toThrow("注册请求已过期");
    });

    test("throws when registration verification fails", async () => {
      const s = setup();
      mockVerifyRegistrationResponse.mockResolvedValueOnce({ verified: false } as any);
      await s.cache.set("passkey_reg:challenge-1", "reg-challenge-base64", { ttl: 120 });

      await expect(
        s.passkeyService.finishRegistration("user-1", "My Key", "challenge-1", { id: "cred-123" } as any)
      ).rejects.toThrow("通行密钥验证失败");
    });

    test("stores passkey in DB and returns list item", async () => {
      const s = setup();
      // Pre-store a challenge
      await s.cache.set("passkey_reg:challenge-1", "reg-challenge-base64", { ttl: 120 });

      const result = await s.passkeyService.finishRegistration(
        "user-1", "My Key", "challenge-1", { id: "cred-123" } as any
      );

      expect(result.name).toBe("My Key");
      expect(result.id).toBeDefined();
      // Verify INSERT was called
      const insertCall = s.calls.find(c => c.text.includes("INSERT INTO sys_passkey"));
      expect(insertCall).toBeDefined();
    });

    test("logs audit entry on success", async () => {
      const s = setup();
      await s.cache.set("passkey_reg:challenge-1", "reg-challenge-base64", { ttl: 120 });

      await s.passkeyService.finishRegistration(
        "user-1", "My Key", "challenge-1", { id: "cred-123" } as any
      );

      const audit = s.auditStore._entries.find(e => e.action === "passkey.registered");
      expect(audit).toBeDefined();
      expect(audit.actor).toBe("user-1");
    });
  });

  describe("beginAuthentication", () => {
    test("throws when user not found", async () => {
      const s = setup();
      s.results.set("sys_user", []);

      await expect(s.passkeyService.beginAuthentication("nobody")).rejects.toThrow("通行密钥登录失败");
    });

    test("throws when user has no passkeys", async () => {
      const s = setup();
      s.results.set("sys_user", [{ id: "user-1" }]);
      s.results.set("sys_passkey WHERE user_id", []);

      await expect(s.passkeyService.beginAuthentication("admin")).rejects.toThrow("通行密钥登录失败");
    });

    test("returns options and challengeId for valid user with passkeys", async () => {
      const s = setup();
      s.results.set("sys_user", [{ id: "user-1" }]);
      s.results.set("sys_passkey WHERE user_id", [
        { credential_id: "cred-123", transports: '["internal"]' },
      ]);

      const result = await s.passkeyService.beginAuthentication("admin");

      expect(result.options).toBeDefined();
      expect(result.challengeId).toBeDefined();
      expect(mockGenerateAuthenticationOptions).toHaveBeenCalled();

      // Verify challenge + userId stored in cache
      const cached = await s.cache.get<string>(`passkey_auth:${result.challengeId}`);
      expect(cached).toBeDefined();
      const parsed = JSON.parse(cached!);
      expect(parsed.userId).toBe("user-1");
      expect(parsed.username).toBe("admin");
    });
  });

  describe("finishAuthentication", () => {
    test("throws when challenge expired", async () => {
      const s = setup();
      await expect(
        s.passkeyService.finishAuthentication("nonexistent", {} as any)
      ).rejects.toThrow("认证请求已过期");
    });

    test("throws and logs audit when verification fails", async () => {
      const s = setup();
      mockVerifyAuthenticationResponse.mockResolvedValueOnce({ verified: false } as any);
      await s.cache.set("passkey_auth:challenge-1", JSON.stringify({
        challenge: "auth-challenge-base64", userId: "user-1", username: "admin",
      }), { ttl: 120 });
      s.results.set("credential_id", [{
        id: "pk-1", credential_id: "cred-123", public_key: Buffer.from("pubkey").toString("base64"), counter: 0,
      }]);

      await expect(
        s.passkeyService.finishAuthentication("challenge-1", { id: "cred-123" } as any)
      ).rejects.toThrow("通行密钥验证失败");

      const audit = s.auditStore._entries.find(e => e.action === "passkey.auth_failed");
      expect(audit).toBeDefined();
    });

    test("throws when passkey not found", async () => {
      const s = setup();
      await s.cache.set("passkey_auth:challenge-1", JSON.stringify({
        challenge: "auth-challenge-base64", userId: "user-1", username: "admin",
      }), { ttl: 120 });
      s.results.set("credential_id", []);

      await expect(
        s.passkeyService.finishAuthentication("challenge-1", { id: "nonexistent" } as any)
      ).rejects.toThrow("通行密钥未找到");
    });

    test("returns userId and username on success", async () => {
      const s = setup();
      await s.cache.set("passkey_auth:challenge-1", JSON.stringify({
        challenge: "auth-challenge-base64", userId: "user-1", username: "admin",
      }), { ttl: 120 });
      s.results.set("credential_id", [{
        id: "pk-1", credential_id: "cred-123", public_key: "pubkey-abc", counter: 0,
      }]);

      const result = await s.passkeyService.finishAuthentication("challenge-1", { id: "cred-123" } as any);

      expect(result.userId).toBe("user-1");
      expect(result.username).toBe("admin");

      // Verify counter update
      const updateCall = s.calls.find(c => c.text.includes("UPDATE sys_passkey SET counter"));
      expect(updateCall).toBeDefined();
    });
  });

  describe("listPasskeys", () => {
    test("returns mapped passkey list without sensitive data", async () => {
      const s = setup();
      s.results.set("sys_passkey WHERE user_id", [
        { id: "pk-1", name: "MacBook", device_type: "singleDevice", backed_up: false, created_at: "2025-01-01", last_used_at: null },
        { id: "pk-2", name: "iPhone", device_type: "multiDevice", backed_up: true, created_at: "2025-01-02", last_used_at: "2025-01-03" },
      ]);

      const list = await s.passkeyService.listPasskeys("user-1");

      expect(list).toHaveLength(2);
      expect(list[0]).toEqual({
        id: "pk-1", name: "MacBook", deviceType: "singleDevice",
        backedUp: false, createdAt: "2025-01-01", lastUsedAt: null,
      });
      expect(list[1]).toEqual({
        id: "pk-2", name: "iPhone", deviceType: "multiDevice",
        backedUp: true, createdAt: "2025-01-02", lastUsedAt: "2025-01-03",
      });
    });
  });

  describe("removePasskey", () => {
    test("throws when passkey does not belong to user", async () => {
      const s = setup();
      s.results.set("sys_passkey WHERE id", []);

      await expect(s.passkeyService.removePasskey("user-1", "pk-other")).rejects.toThrow("通行密钥不存在或不属于当前用户");
    });

    test("deletes passkey and logs audit", async () => {
      const s = setup();
      s.results.set("sys_passkey WHERE id", [{ id: "pk-1" }]);

      await s.passkeyService.removePasskey("user-1", "pk-1");

      const deleteCall = s.calls.find(c => c.text.includes("DELETE FROM sys_passkey"));
      expect(deleteCall).toBeDefined();
      expect(deleteCall!.params).toEqual(["pk-1"]);

      const audit = s.auditStore._entries.find(e => e.action === "passkey.removed");
      expect(audit).toBeDefined();
    });
  });
});
